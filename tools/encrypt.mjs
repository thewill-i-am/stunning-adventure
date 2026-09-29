import { randomBytes, webcrypto } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const privateDir = join(root, ".private");
const assetsDir = join(root, "assets");
const passwordFile = join(privateDir, "passphrase.txt");
const saltFile = join(privateDir, "salt.bin");
const iterations = 600_000;

await mkdir(privateDir, { recursive: true });

let password;
try {
  password = (await readFile(passwordFile, "utf8")).trim();
} catch (error) {
  if (error.code !== "ENOENT") throw error;
  password = `Juli-${randomBytes(24).toString("base64url")}`;
  await writeFile(passwordFile, `${password}\n`, { mode: 0o600 });
}

if (!password) throw new Error(".private/passphrase.txt no puede estar vacío.");

let salt;
try {
  salt = await readFile(saltFile);
} catch (error) {
  if (error.code !== "ENOENT") throw error;
  salt = randomBytes(16);
  await writeFile(saltFile, salt, { mode: 0o600 });
}

const keyMaterial = await webcrypto.subtle.importKey(
  "raw",
  new TextEncoder().encode(password.normalize("NFKC")),
  "PBKDF2",
  false,
  ["deriveKey"],
);
const key = await webcrypto.subtle.deriveKey(
  { name: "PBKDF2", hash: "SHA-256", salt, iterations },
  keyMaterial,
  { name: "AES-GCM", length: 256 },
  false,
  ["encrypt"],
);
const manifest = {
  version: 1,
  kdf: { name: "PBKDF2", hash: "SHA-256", iterations, salt: salt.toString("base64") },
  cipher: "AES-GCM",
  files: {},
};
const types = { ".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg" };
const folders = (await readdir(privateDir, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory() && entry.name.startsWith("carta-"))
  .sort((a, b) => a.name.localeCompare(b.name));

for (const folder of folders) {
  const sourceDir = join(privateDir, folder.name);
  const outputDir = join(assetsDir, folder.name);
  await mkdir(outputDir, { recursive: true });

  const files = (await readdir(sourceDir))
    .filter((file) => types[extname(file).toLowerCase()])
    .sort((a, b) => a.localeCompare(b));

  for (const file of files) {
    const source = await readFile(join(sourceDir, file));
    const iv = randomBytes(12);
    const encrypted = await webcrypto.subtle.encrypt({ name: "AES-GCM", iv }, key, source);
    const publicName = `${file}.enc`;
    const id = `assets/${folder.name}/${file}`;

    await writeFile(join(outputDir, publicName), Buffer.from(encrypted));
    manifest.files[id] = {
      path: `assets/${folder.name}/${publicName}`,
      type: types[extname(file).toLowerCase()],
      iv: iv.toString("base64"),
    };
  }
}

if (!Object.keys(manifest.files).length) throw new Error("No se encontraron imágenes dentro de .private/carta-*.");

await writeFile(join(assetsDir, "crypto.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Cifradas ${Object.keys(manifest.files).length} páginas. La contraseña está solamente en .private/passphrase.txt.`);
