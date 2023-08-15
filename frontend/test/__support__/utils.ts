export const getNextId = (() => {
  let id = 0;
  return () => ++id;
})();
