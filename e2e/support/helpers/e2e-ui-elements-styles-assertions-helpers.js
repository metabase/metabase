export const assertIsEllipsified = element => {
  expect(isEllipsified(element), "is ellipsified").to.equal(true);
};

export const assertIsNotEllipsified = element => {
  expect(isEllipsified(element), "is ellipsified").to.equal(false);
};

export const isEllipsified = element => {
  return (
    element.scrollHeight > element.clientHeight ||
    element.scrollWidth > element.clientWidth
  );
};
