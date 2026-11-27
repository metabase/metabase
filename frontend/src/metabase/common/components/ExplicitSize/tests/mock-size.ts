interface Size {
  width: number;
  height: number;
}

const DEFAULT_SIZE: Size = { width: 1000, height: 1000 };

let mockSize = DEFAULT_SIZE;

/** The size that the mocked `ExplicitSize` gives the components it wraps */
export function getMockExplicitSize(): Size {
  return mockSize;
}

/**
 * Sets the size that the mocked `ExplicitSize` gives the components it wraps,
 * from their next render on. Reset it with `resetMockExplicitSize`.
 */
export function setMockExplicitSize(size: Size) {
  mockSize = size;
}

export function resetMockExplicitSize() {
  mockSize = DEFAULT_SIZE;
}
