import React, { useMemo } from "react";
import PropTypes from "prop-types";
import styled from "styled-components";
import { t } from "ttag";
import { color } from "metabase/lib/colors";
import RawEntityLink from "metabase/entities/containers/EntityLink";

export const EntityLink = styled(RawEntityLink)`
  color: ${color("brand")};
  cursor: pointer;
  text-decoration: none;

  :hover {
    text-decoration: underline;
  }
`;

const revisionTitlePropTypes = {
  username: PropTypes.string.isRequired,
  message: PropTypes.node.isRequired,
};

export function RevisionTitle({ username, message }) {
  return <span>{[username, " ", message]}</span>;
}

RevisionTitle.propTypes = revisionTitlePropTypes;

const revisionBatchedDescriptionPropTypes = {
  changes: PropTypes.arrayOf(PropTypes.node).isRequired,
};

export function RevisionBatchedDescription({ changes }) {
  const formattedChanges = useMemo(() => {
    const result = [];

    changes.forEach((change, i) => {
      const isFirst = i === 0;
      result.push(isFirst ? capitalizeChangeRecord(change) : change);
      const isLast = i === changes.length - 1;
      const isBeforeLast = i === changes.length - 2;
      if (isBeforeLast) {
        result.push(" " + t`and` + " ");
      } else if (!isLast) {
        result.push(", ");
      }
    });

    return result;
  }, [changes]);

  return <span>{formattedChanges}</span>;
}

function capitalizeChangeRecord(change) {
  if (Array.isArray(change)) {
    const [first, ...rest] = change;
    return [capitalize(first), ...rest];
  }
  return capitalize(change);
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

RevisionBatchedDescription.propTypes = revisionBatchedDescriptionPropTypes;
