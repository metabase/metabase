import React from "react";

function Link(props) {
  console.log(props);
  if (props.isPreviewing) {
    return (
      <input
        type="text"
        placeholder="Add a link"
        onChange={ev =>
          props.onUpdateVisualizationSettings({ link: ev.target.value })
        }
        value={props.settings.link}
        autoFocus
      />
    );
  } else {
    return props.settings.link ? (
      <a
        className="text-brand-hover text-underline-hover"
        href={props.settings.link}
      >
        {props.settings.link}
      </a>
    ) : (
      ""
    );
  }
}

Link.settings = {
  minSize: { width: 3, height: 1 },
  link: {
    value: "https://google.com",
    description: "",
  },
};

Link.identifier = "link";
Link.supportPreviewing = true;

Link.checkRenderable = () => true;

export default Link;
