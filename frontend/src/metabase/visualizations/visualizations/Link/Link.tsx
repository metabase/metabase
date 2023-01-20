import React from "react";
import SearchBar from "metabase/nav/components/SearchBar";
import Icon from "metabase/components/Icon";

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
            props.onPreviewToggle();
          }}
          value={props.settings.link}
        />
        ;
      </div>
    );
  } else {
    return props.settings.link ? (
      <a
        className="text-brand-hover text-underline-hover flex align-center px2"
        href={props.settings.link}
      >
        <Icon
          className="mr1"
          name={props.dashcard.visualization_settings["link.type"] || "link"}
        />
        {props.dashcard.visualization_settings["link.title"] ||
          props.dashcard.visualization_settings.link}
      </a>
    ) : (
      ""
    );
  }
}

Link.settings = {
  link: {},
};

Link.minSize = {
  height: 1,
  width: 3,
};

Link.identifier = "link";
Link.supportPreviewing = true;

Link.checkRenderable = () => true;

export default Link;
