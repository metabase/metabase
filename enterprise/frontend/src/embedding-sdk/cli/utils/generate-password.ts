export function generateRandomDemoPassword(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz";
  const upperCaseChars = chars.toUpperCase();
  const numbers = "0123456789";

  const allChars = chars + upperCaseChars + numbers;
  const length = 14;

  let password = "";

  //make sure we have at least 1 number, one upper case and one lower case character
  password += pickRandom(chars);
  password += pickRandom(upperCaseChars);
  password += pickRandom(numbers);

  for (let i = password.length; i < length; i++) {
    password += pickRandom(allChars);
  }

  return shuffle(password);
}

const pickRandom = (arr: string) => arr[Math.floor(Math.random() * arr.length)];

const shuffle = (arr: string) =>
  arr
    .split("")
    .sort(() => Math.random() - 0.5)
    .join("");
