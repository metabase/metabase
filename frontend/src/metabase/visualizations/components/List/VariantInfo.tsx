import React from "react";

import { isEmpty } from "metabase/lib/validate";
import { Avatar } from "metabase/components/UserAvatar";

import { isImageURL } from "metabase-lib/types/utils/isa";

import type { ListVariantProps } from "./types";
import {
  InfoListItem,
  ListItemTitle,
  ListItemSubtitle,
  InfoLeft,
  InfoRight,
} from "./VariantInfo.styled";

import ListCell from "./ListCell";

export const VariantInfo = ({
  data,
  row,
  listColumnIndexes,
  settings,
  getColumnTitle,
}: ListVariantProps) => {
  if (!data || !row) {
    return null;
  }

  const [imageIndex] = listColumnIndexes.image;
  const [titleIndex, subtitleIndex, subtitle2Index] = listColumnIndexes.left;
  const [infoIndex] = listColumnIndexes.right;

  const image = row[imageIndex];
  const title = row[titleIndex];
  const subtitle = row[subtitleIndex];
  const subtitle2 = row[subtitle2Index];
  const info = row[infoIndex];

  const imageColIsImage = isImageURL(data.cols[imageIndex]);

  return (
    <InfoListItem>
      <InfoLeft>
        {image && imageColIsImage && (
          <ListCell
            value={image}
            columnTitle={getColumnTitle(imageIndex)}
            data={data}
            settings={settings}
            columnIndex={imageIndex}
          />
        )}
        {image && !imageColIsImage && (
          <Avatar>{String(row?.[imageIndex])}</Avatar>
        )}
        <div>
          <ListItemTitle>
            {!isEmpty(title) && (
              <ListCell
                value={title}
                columnTitle={getColumnTitle(titleIndex)}
                data={data}
                settings={settings}
                columnIndex={titleIndex}
              />
            )}
          </ListItemTitle>
          <ListItemSubtitle>
            {!isEmpty(subtitle) && (
              <ListCell
                value={subtitle}
                columnTitle={getColumnTitle(subtitleIndex)}
                data={data}
                settings={settings}
                columnIndex={subtitleIndex}
              />
            )}
            {!isEmpty(subtitle) && !isEmpty(subtitle2) && " - "}
            {!isEmpty(subtitle2) && (
              <ListCell
                value={subtitle2}
                columnTitle={getColumnTitle(subtitle2Index)}
                data={data}
                settings={settings}
                columnIndex={subtitle2Index}
              />
            )}
          </ListItemSubtitle>
        </div>
      </InfoLeft>
      <InfoRight>
        {!isEmpty(info) && (
          <ListCell
            value={info}
            columnTitle={getColumnTitle(infoIndex)}
            data={data}
            settings={settings}
            columnIndex={infoIndex}
          />
        )}
      </InfoRight>
    </InfoListItem>
  );
};
