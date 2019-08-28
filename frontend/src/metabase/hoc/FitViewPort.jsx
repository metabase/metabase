import React from "react";

/* fitViewport allows you to modify the top level classes on the react root node
 * to set certain display properties that make it easier to create a view that will always
 * be the size of the viewport height.
 *
 * When to use this
 * ----------------------------------------------------------------------------
 * You need to ensure things can stretch to the full size of the current
 * view port no matter what size the things are.
 *
 * When not to use this
 * ----------------------------------------------------------------------------
 * You want content to expand to its size, so lists of things is probably a bad
 *
 * On an element that isn't the top level of a route.
 *
 */

function fitViewport(ComposedComponent) {
  return class extends React.Component {
    static displayName = "FitViewport";

    /*
     * Whats happening here:
     * 1. set the position of the element to 'absolute' and have it stretch to
     * the top, left, botto, and right of the viewport which should be all of it
     * since we set the 'html', 'body', and '#root' elements to have a height
     * of 100%.
     *
     * 2. set a flex context. Since the immediate children should be the
     * nav and the current route this will allow the
     *
     * 3. Set the flex direction to flex-column to keep the content vertical
     */

    // componentDidMount is required here to ensure the top level react child is present
    componentDidMount() {
      const root = document.getElementById("root");
      if (root && root.firstChild) {
        root.firstChild.classList.add("spread", "flex", "flex-column");
      }
    }

    componentWillUnmount() {
      const root = document.getElementById("root");
      if (root && root.firstChild) {
        root.firstChild.classList.remove("spread", "flex", "flex-column");
      }
    }

    render() {
      return (
        <ComposedComponent
          {...this.props}
          fitClassNames="relative flex flex-full"
        />
      );
    }
  };
}

export default fitViewport;
