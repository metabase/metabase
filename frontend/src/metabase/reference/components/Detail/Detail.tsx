import React from "react";
import { Link } from "react-router";
import { t } from "ttag";
import {
  DetailRoot,
  DetailBody,
  DetailTitle,
  DetailSubtitle,
  DetailError,
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
}

const Detail = ({
  url,
  title,
  description,
  placeholder,
  isEditing,
  touched,
  error,
}: DetailProps) => {
  return (
    <DetailRoot>
      <DetailBody isEditing={isEditing}>
        <DetailTitle>
          {url ? <Link to={url}>{title}</Link> : <span>{title}</span>}
        </DetailTitle>
        <DetailSubtitle hasDescription={Boolean(description)}>
          <span>{description || placeholder || t`No description yet`}</span>
          {isEditing && error && touched && <DetailError>{error}</DetailError>}
        </DetailSubtitle>
      </DetailBody>
    </DetailRoot>
  );
};

export default Detail;
