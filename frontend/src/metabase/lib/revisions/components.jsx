import React, { useMemo } from "react";
import PropTypes from "prop-types";
import styled from "@emotion/styled";
import { t } from "ttag";
import { color } from "metabase/lib/colors";
import { capitalize } from "metabase/lib/formatting";
import RawEntityLink from "metabase/entities/containers/EntityLink";
import { getRevisionTitleText } from "./revisions";

export const EntityLink = styled(RawEntityLink)`
  color: ${color("brand")};
  cursor: pointer;
  text-decoration: none;

  :hover {
    text-decoration: underline;
  }
`;

EntityLink.defaultProps = {
  dispatchApiErrorEvent: false,
};

const revisionTitlePropTypes = {
  username: PropTypes.string.isRequired,
  message: PropTypes.node.isRequired,
  event: PropTypes.node,
  revertFn: PropTypes.func,
};

export function RevisionTitle({ username, message }) {
  return <span>{getRevisionTitleText(username, message)}</span>;
}

RevisionTitle.propTypes = revisionTitlePropTypes;

const revisionBatchedDescriptionPropTypes = {
  changes: PropTypes.arrayOf(PropTypes.node).isRequired,
  fallback: PropTypes.string,
};

export function RevisionBatchedDescription({ changes, fallback }) {
  const formattedChanges = useMemo(() => {
    let result = [];

    changes.forEach((change, i) => {
      try {
        const isFirst = i === 0;
        result.push(isFirst ? capitalizeChangeRecord(change) : change);
        const isLast = i === changes.length - 1;
        const isBeforeLast = i === changes.length - 2;
        if (isBeforeLast) {
          result.push(" " + t`and` + " ");
        } else if (!isLast) {
          result.push(", ");
        }
      } catch {
        console.warn("Error formatting revision changes", changes);
        result = fallback;
      }
    });

    return result;
  }, [changes, fallback]);

  return <span>{formattedChanges}</span>;
}

function capitalizeChangeRecord(change) {
  if (Array.isArray(change)) {
    const [first, ...rest] = change;
    if (Array.isArray(first)) {
      return capitalizeChangeRecord(first);
    }
    return [capitalize(first, { lowercase: false }), ...rest];
  }
  return capitalize(change, { lowercase: false });
}

RevisionBatchedDescription.propTypes = revisionBatchedDescriptionPropTypes;
