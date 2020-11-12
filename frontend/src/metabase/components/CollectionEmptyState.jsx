import React from "react";
import { t } from "ttag";
import { withRouter } from "react-router";
import { Box, Flex } from "grid-styled";

import { color } from "metabase/lib/colors";
import * as Urls from "metabase/lib/urls";

import Icon from "metabase/components/Icon";
import EmptyState from "metabase/components/EmptyState";
import IconWrapper from "metabase/components/IconWrapper";
import Link from "metabase/components/Link";

const Element = ({
  iconName,
  iconBackgroundColor = color("brand"),
  textWidth,
}) => (
  <Flex
    className="bg-white rounded shadowed"
    align="center"
    p={2}
    w={"300px"}
    mb={1}
  >
    <IconWrapper borderRadius={"99px"} bg={iconBackgroundColor} p={1} mr={1}>
      <Icon name={iconName} color="white" />
    </IconWrapper>
    <Box
      w={textWidth}
      bg={color("brand-light")}
      style={{ height: 8, borderRadius: 99 }}
    />
  </Flex>
);

const CollectionEmptyState = ({ params }) => {
  return (
    <EmptyState
      title={t`Nothing to see yet.`}
      message={t`Use collections to organize and group dashboards and questions for your team or yourself`}
      illustrationElement={
        <Box>
          <Element iconName="dashboard" textWidth={110} />
          <Element
            iconName="question"
            iconBackgroundColor={color("bg-medium")}
            textWidth={48}
          />
          <Element
            iconName="folder"
            iconBackgroundColor={color("brand-light")}
            textWidth={72}
          />
        </Box>
      }
      link={
        <Link
          className="link text-bold"
          mt={2}
          to={Urls.newCollection(params.collectionId)}
        >{t`Create another collection`}</Link>
      }
    />
  );
};

export default withRouter(CollectionEmptyState);
