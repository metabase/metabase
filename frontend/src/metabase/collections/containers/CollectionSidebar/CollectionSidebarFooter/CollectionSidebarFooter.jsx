/* eslint-disable react/prop-types */
import React from "react";
import { t } from "ttag";

import * as Urls from "metabase/lib/urls";
import { Container, Icon, Link } from "./CollectionSidebarFooter.styled";

export default function CollectionSidebarFooter({ isSuperUser }) {
  return (
    <Container>
      {isSuperUser && (
        <Link my={2} to={Urls.collection({ id: "users" })}>
          <Icon name="group" />
          {t`Other users' personal collections`}
        </Link>
      )}

      <Link to={`/archive`}>
        <Icon name="view_archive" />
        {t`View archive`}
      </Link>
    </Container>
  );
}
