import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { access, readFile, readdir } from "node:fs/promises";

const html = await readFile("index.html", "utf8");
const script = await readFile("script.js", "utf8");

assert.match(html, /id="key-form"/);
assert.match(html, /id="reader-dialog"/);
assert.match(script, /number <= 21/);
assert.doesNotMatch(script, /acceptedKeys|localStorage/);

const manifest = JSON.parse(await readFile("assets/crypto.json", "utf8"));
const publicPages = await readdir("assets/carta-01");
assert.equal(Object.keys(manifest.files).length, 5);
assert.equal(publicPages.length, 5);
assert.ok(publicPages.every((file) => file.endsWith(".enc")));
await Promise.all(Object.values(manifest.files).map((file) => access(file.path)));

try {
  const password = (await readFile(".private/passphrase.txt", "utf8")).trim();
  const firstId = Object.keys(manifest.files)[0];
  const file = manifest.files[firstId];
  const keyMaterial = await webcrypto.subtle.importKey("raw", new TextEncoder().encode(password.normalize("NFKC")), "PBKDF2", false, ["deriveKey"]);
  const key = await webcrypto.subtle.deriveKey(
    { ...manifest.kdf, salt: Buffer.from(manifest.kdf.salt, "base64") },
    keyMaterial,
    { name: manifest.cipher, length: 256 },
    false,
    ["decrypt"],
  );
  const ciphertext = await readFile(file.path);
  const decrypted = await webcrypto.subtle.decrypt(
    { name: manifest.cipher, iv: Buffer.from(file.iv, "base64") },
    key,
    ciphertext,
  );
  assert.deepEqual(Buffer.from(decrypted), await readFile(`.private/${firstId.replace("assets/", "")}`));

  const wrongMaterial = await webcrypto.subtle.importKey("raw", new TextEncoder().encode("contraseña-incorrecta"), "PBKDF2", false, ["deriveKey"]);
  const wrongKey = await webcrypto.subtle.deriveKey(
    { ...manifest.kdf, salt: Buffer.from(manifest.kdf.salt, "base64") },
    wrongMaterial,
    { name: manifest.cipher, length: 256 },
    false,
    ["decrypt"],
  );
  await assert.rejects(() => webcrypto.subtle.decrypt(
    { name: manifest.cipher, iv: Buffer.from(file.iv, "base64") },
    wrongKey,
    ciphertext,
  ));
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}

console.log("Smoke check: 5 páginas cifradas y sin originales públicos.");
