import React from "react";

function Link() {
  return <a>Link</a>;
}

Link.settings = {
  minSize: { width: 3, height: 1 },
};

Link.identifier = "link";

Link.checkRenderable = () => true;

export default Link;
