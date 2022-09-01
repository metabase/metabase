/* eslint-disable react/prop-types */
import React from "react";
import ItemCommon from "./ItemCommon";

const ItemVideo = ({ item }) => {
  return (
    <>
      <iframe
        className="dashboards__recommendations-video"
        width="100%"
        height="100%"
        src={item.mediaUrl}
        title="YouTube video player"
        frameBorder="0"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      />
      <ItemCommon url={item.url} name={item.name} target="_blank" />
    </>
  );
};

export default ItemVideo;
