export function generateRandomDemoPassword(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz";
  const numbers = "0123456789";

  const allChars = chars + chars.toUpperCase() + numbers;
  const length = 12;

  let password = "";

  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * allChars.length);
    password += allChars[randomIndex];
  }

  return password;
}
