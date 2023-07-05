chai.Assertion.addProperty("scrollableHorizontally", function () {
  this._obj.then(subject => {
    const { clientHeight, offsetHeight } = subject[0];
    const style = window.getComputedStyle(subject[0]);
    const borderTopWidth = parseInt(style.borderTopWidth, 10);
    const borderBottomWidth = parseInt(style.borderBottomWidth, 10);
    const borderWidth = borderTopWidth + borderBottomWidth;
    const horizontalScrollbarHeight = offsetHeight - clientHeight - borderWidth;
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
    const style = window.getComputedStyle(subject[0]);
    const borderLeftWidth = parseInt(style.borderLeftWidth, 10);
    const borderRightWidth = parseInt(style.borderRightWidth, 10);
    const borderWidth = borderLeftWidth + borderRightWidth;
    const verticalScrollbarWidth = offsetWidth - clientWidth - borderWidth;
    const isVerticalScrollbarVisible = verticalScrollbarWidth > 0;

    this.assert(
      isVerticalScrollbarVisible,
      "expected #{this} to be scrollable vertically",
      "expected #{this} to not be scrollable vertically",
    );
  });
});
