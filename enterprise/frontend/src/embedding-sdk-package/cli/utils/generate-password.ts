import * as crypto from "crypto";

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

// Get a secure random integer within [0, max) (excluding max)
function getRandomInt(max: number): number {
  // crypto.randomBytes returns a Buffer. We can safely pick one byte at a time for moderate sizes.
  // Note: Avoid modulo bias
  if (max <= 0) {
    throw new Error("max must be positive");
  }

  // Special case: when max is 1, the only value in [0, 1) is 0
  if (max === 1) {
    return 0;
  }

  const byteSize = Math.ceil(Math.log2(max) / 8);
  const maxNum = Math.pow(256, byteSize);
  const limit = maxNum - (maxNum % max);
  let rand: number;
  do {
    rand = parseInt(crypto.randomBytes(byteSize).toString("hex"), 16);
  } while (rand >= limit);
  return rand % max;
}

const pickRandom = (arr: string) => arr[getRandomInt(arr.length)];

// Secure Fisher-Yates shuffle
const shuffle = (str: string): string => {
  const arr = str.split("");
  for (let i = arr.length - 1; i > 0; i--) {
    const j = getRandomInt(i + 1); // [0, i]
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.join("");
};
