import React from "react";
import { t } from "ttag";

import { isEmpty } from "metabase/lib/validate";
import { Avatar } from "metabase/components/UserAvatar";

import { isImageURL } from "metabase-lib/types/utils/isa";

import type { ListColumnIndexes, ListVariantProps } from "./types";
import {
  InfoListItem,
  ListHeader,
  ListItemTitle,
  ListItemSubtitle,
  InfoLeft,
  InfoRight,
  RightHeader,
} from "./VariantInfo.styled";

import ListCell from "./ListCell";

const getNamedColumnIndexes = (listColumnIndexes: ListColumnIndexes) => {
  const [imageIndex] = listColumnIndexes.image;
  const [titleIndex, subtitleIndex, subtitle2Index] = listColumnIndexes.left;
  const [infoIndex] = listColumnIndexes.right;

  return {
    imageIndex,
    titleIndex,
    subtitleIndex,
    subtitle2Index,
    infoIndex,
  };
};

export const VariantInfoHeader = ({
  listColumnIndexes,
  getColumnTitle,
}: {
  listColumnIndexes: ListColumnIndexes;
  getColumnTitle: (columnIndex: number) => string;
}) => {
  const { imageIndex, titleIndex, subtitleIndex, subtitle2Index, infoIndex } =
    getNamedColumnIndexes(listColumnIndexes);

  const leftTitleArray = [
    getColumnTitle(titleIndex),
    getColumnTitle(subtitleIndex),
    getColumnTitle(subtitle2Index),
  ].filter(Boolean);

  const leftTitle =
    leftTitleArray.length === 3
      ? t`${leftTitleArray[0]}, ${leftTitleArray[1]}, and ${leftTitleArray[2]}`
      : leftTitleArray.join(" & ");

  return (
    <ListHeader hasImage={!isEmpty(imageIndex)}>
      <div>{leftTitle}</div>
      <RightHeader>{getColumnTitle(infoIndex)}</RightHeader>
    </ListHeader>
  );
};

export const VariantInfoRow = ({
  data,
  row,
  listColumnIndexes,
  settings,
}: ListVariantProps) => {
  if (!data || !row) {
    return null;
  }

  const { imageIndex, titleIndex, subtitleIndex, subtitle2Index, infoIndex } =
    getNamedColumnIndexes(listColumnIndexes);

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
                data={data}
                settings={settings}
                columnIndex={subtitleIndex}
              />
            )}
            {!isEmpty(subtitle) && !isEmpty(subtitle2) && " - "}
            {!isEmpty(subtitle2) && (
              <ListCell
                value={subtitle2}
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
            data={data}
            settings={settings}
            columnIndex={infoIndex}
          />
        )}
      </InfoRight>
    </InfoListItem>
  );
};
