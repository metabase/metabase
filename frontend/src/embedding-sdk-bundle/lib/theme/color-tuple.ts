type ColorTuple = [
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
];

export const colorTuple = (value: string): ColorTuple =>
  // Unjustified type cast. FIXME
  [...Array(10)].fill(value) as ColorTuple;
