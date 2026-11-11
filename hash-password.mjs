// Prints a password hash. Run on your own computer: node hash-password.mjs "a password of 12+ characters". Paste ONLY the result into the ADMIN_PASSWORD_HASH secret.
import { hashPassword } from "./worker/admin.js";
const pw = process.argv[2];
if (!pw || pw.length < 12) { console.error("Usage : node hash-password.mjs '<mot de passe de 12 caractères ou plus>'"); process.exit(1); }
console.log(await hashPassword(pw));
