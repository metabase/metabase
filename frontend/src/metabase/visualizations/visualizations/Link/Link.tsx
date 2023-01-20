import React from "react";
import SearchBar from "metabase/nav/components/SearchBar";

function Link(props) {
  console.log(props);
  if (props.isPreviewing) {
    return (
      <div style={{ pointerEvents: "all" }}>
        <SearchBar
          style={{ pointerEvents: "all" }}
          onClick={item => {
            props.onUpdateVisualizationSettings({
              link: item.getUrl(),
              "link.title": item.name,
              "link.type": item.type,
            });
          }}
          value={props.settings.link}
        />
        ;
      </div>
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
  link: {},
};

Link.identifier = "link";
Link.supportPreviewing = true;

Link.checkRenderable = () => true;

export default Link;
