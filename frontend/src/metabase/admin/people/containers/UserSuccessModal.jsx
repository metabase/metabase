import React from "react";
import { Box } from "grid-styled";
import { t, jt } from "c-3po";

import { connect } from "react-redux";
import { push } from "react-router-redux";

import { entityObjectLoader } from "metabase/entities/containers/EntityObjectLoader";

import Button from "metabase/components/Button";
import Link from "metabase/components/Link";
import ModalContent from "metabase/components/ModalContent";
import PasswordReveal from "metabase/components/PasswordReveal";

const EmailSuccess = () => <Box />;

const PasswordSuccess = ({ user, password }) => (
  <Box>
    <Box pb={4}>
      {jt`We couldn’t send them an email invitation, so make sure to tell them to log in using ${(
        <span className="text-bold">{user.email}</span>
      )}
                    and this password we’ve generated for them:`}
    </Box>

    <PasswordReveal password={password} />
    <Box
      style={{ paddingLeft: "5em", paddingRight: "5em" }}
      className="pt4 text-centered"
    >
      {jt`If you want to be able to send email invites, just go to the ${(
        <Link to="/admin/settings/email" className="link text-bold">
          Email Settings
        </Link>
      )} page.`}
    </Box>
  </Box>
);

const UserSuccessModal = ({ onClose, object, location }) => (
  <ModalContent title={t`Added ${object.getName()}`} onClose={onClose}>
    {location.query && location.query.p ? (
      <PasswordSuccess user={object} password={location.query.p} />
    ) : (
      <EmailSuccess user={object} />
    )}
    <Button primary onClick={() => onClose()}>{t`Done`}</Button>
  </ModalContent>
);

const mapDispatchToProps = {
  onClose: () => push("/admin/people"),
};

export default entityObjectLoader({
  entityType: "users",
  entityId: (state, props) => props.params.userId,
  wrapped: true,
})(connect(null, mapDispatchToProps)(UserSuccessModal));
