test.each([1, 2])("each %i with done", (value, done) => {
  setTimeout(done, 1);
});
