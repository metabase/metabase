// Simple Fast Counter - as recommended by PRACTRAND
const sfc32 = (a, b, c, d) => {
  return () => {
    a >>>= 0;
    b >>>= 0;
    c >>>= 0;
    d >>>= 0;
    let t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
};

export function createRandom(seed) {
  const u32seed = seed ^ 0xc0fefe;
  const mathRandom = sfc32(0x9e3779b9, 0x243f6a88, 0xb7e15162, u32seed);
  [...Array(15)].forEach(mathRandom);
  return mathRandom;
}
