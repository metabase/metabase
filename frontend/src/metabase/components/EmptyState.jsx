/* eslint-disable react/prop-types */
import React from "react";

import Button from "metabase/core/components/Button";
import Icon from "metabase/components/Icon";
import Link from "metabase/core/components/Link";
import Text from "metabase/components/type/Text";
import {
  EmptyStateActions,
  EmptyStateFooter,
  EmptyStateHeader,
  EmptyStateIllustration,
} from "./EmptyState.styled";

// Don't break existing empty states
// TODO - remove these and update empty states with proper usage of illustrationElement
const LegacyIcon = props =>
  props.icon ? (
    <Icon name={props.icon} className="text-light" size={40} />
  ) : null;
const LegacyImage = props =>
  props.image ? (
    <img
      src={`${props.image}.png`}
      width="300px"
      height={props.imageHeight}
      alt={props.message}
      srcSet={`${props.image}@2x.png 2x`}
      className={props.imageClassName}
    />
  ) : null;

const EmptyState = ({
  title,
  message,
  action,
  link,
  illustrationElement,
  onActionClick,
  ...rest
}) => (
  <div>
    <EmptyStateHeader>
      {illustrationElement && (
        <EmptyStateIllustration>{illustrationElement}</EmptyStateIllustration>
      )}
      <div>
        <LegacyIcon {...rest} />
        <LegacyImage {...rest} />
      </div>
      {title && <h2 className="text-medium">{title}</h2>}
      {message && <Text color="medium">{message}</Text>}
    </EmptyStateHeader>
    {/* TODO - we should make this children or some other more flexible way to
      add actions
      */}
    <EmptyStateFooter>
      <EmptyStateActions>
        {action && link && (
          <Link to={link} target={link.startsWith("http") ? "_blank" : ""}>
            <Button primary>{action}</Button>
          </Link>
        )}
        {action && onActionClick && (
          <Button onClick={onActionClick} primary>
            {action}
          </Button>
        )}
      </EmptyStateActions>
    </EmptyStateFooter>
  </div>
);

export default EmptyState;
