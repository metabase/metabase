chai.Assertion.addProperty("scrollableHorizontally", function () {
  this._obj.then(subject => {
    const { clientHeight, offsetHeight } = subject[0];
    const horizontalScrollbarHeight = offsetHeight - clientHeight;
    const isHorizontalScrollbarVisible = horizontalScrollbarHeight > 0;

    this.assert(
      isHorizontalScrollbarVisible,
      "expected #{this} to be scrollable horizontally",
      "expected #{this} to not be scrollable horizontally",
    );
  });
});

chai.Assertion.addProperty("scrollableVertically", function () {
  this._obj.then(subject => {
    const { clientWidth, offsetWidth } = subject[0];
    const verticalScrollbarWidth = offsetWidth - clientWidth;
    const isVerticalScrollbarVisible = verticalScrollbarWidth > 0;

    this.assert(
      isVerticalScrollbarVisible,
      "expected #{this} to be scrollable vertically",
      "expected #{this} to not be scrollable vertically",
    );
  });
});
