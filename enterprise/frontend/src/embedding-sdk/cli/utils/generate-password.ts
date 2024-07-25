export function generateRandomDemoPassword(): string {
  const lowerCaseChars = "abcdefghijklmnopqrstuvwxyz";
  const numbers = "0123456789";

  const allChars = lowerCaseChars + numbers;
  const length = 10;

  let password = "";

  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * allChars.length);
    password += allChars[randomIndex];
  }

  return password;
}
