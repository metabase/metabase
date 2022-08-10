import React, { ChangeEvent } from "react";
import { Link } from "react-router";
import { t } from "ttag";
import {
  DetailRoot,
  DetailBody,
  DetailTitle,
  DetailSubtitle,
  DetailError,
  DetailTextArea,
} from "./Detail.styled";

export interface DetailProps {
  name: string;
  url?: string;
  title: string;
  description?: string;
  placeholder?: string;
  isEditing?: boolean;
  touched?: boolean;
  error?: string;
  onChange?: (event: ChangeEvent<HTMLTextAreaElement>) => void;
}

const Detail = ({
  url,
  title,
  description,
  placeholder,
  isEditing,
  touched,
  error,
  onChange,
}: DetailProps) => {
  return (
    <DetailRoot>
      <DetailBody isEditing={isEditing}>
        <DetailTitle>
          {url ? <Link to={url}>{title}</Link> : <span>{title}</span>}
        </DetailTitle>
        <DetailSubtitle hasDescription={Boolean(description)}>
          {isEditing ? (
            <DetailTextArea
              placeholder={placeholder}
              defaultValue={description}
              onChange={onChange}
            />
          ) : (
            <span>{description || placeholder || t`No description yet`}</span>
          )}
          {isEditing && error && touched && <DetailError>{error}</DetailError>}
        </DetailSubtitle>
      </DetailBody>
    </DetailRoot>
  );
};

export default Detail;
