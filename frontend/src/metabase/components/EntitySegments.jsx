import React from "react";
import { Box } from "grid-styled";
import { Link } from "react-router";
import { t } from "c-3po";

const EntitySegments = ({ question }) => {
  const segments = question.query().filterSegmentOptions();

  window.s = segments;
  window.q = question;

  if (!segments.length > 0) {
    return null;
  }

  return (
    <Box>
      <h3>{t`Segments for this`}</h3>
      {segments.map(segment => {
        const link = question
          .query()
          .addFilter(["segment", segment.id])
          .question()
          .getUrl();
        return <Link to={link}>{segment.name}</Link>;
      })}
    </Box>
  );
};

export default EntitySegments;
