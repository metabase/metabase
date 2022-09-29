export function generateParameterId() {
  const num = Math.floor(Math.random() * Math.pow(2, 32));
  return num.toString(16);
}
