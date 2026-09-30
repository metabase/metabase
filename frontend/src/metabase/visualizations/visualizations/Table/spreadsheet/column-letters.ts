// Excel-style column letters: 0 -> "A", 25 -> "Z", 26 -> "AA", 51 -> "AZ", 52 -> "BA", ...

const ALPHABET_SIZE = 26;
const A_CHAR_CODE = "A".charCodeAt(0);

export function indexToColumnLetter(index: number): string {
  let n = index;
  let letters = "";
  do {
    letters = String.fromCharCode(A_CHAR_CODE + (n % ALPHABET_SIZE)) + letters;
    n = Math.floor(n / ALPHABET_SIZE) - 1;
  } while (n >= 0);
  return letters;
}

export function columnLetterToIndex(letters: string): number {
  let index = 0;
  for (const char of letters.toUpperCase()) {
    index = index * ALPHABET_SIZE + (char.charCodeAt(0) - A_CHAR_CODE + 1);
  }
  return index - 1;
}
