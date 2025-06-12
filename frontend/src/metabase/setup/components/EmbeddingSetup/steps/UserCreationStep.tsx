import { replace } from "react-router-redux";
import { t } from "ttag";

import { useDispatch, useSelector } from "metabase/lib/redux";
import { Box, Text, Title } from "metabase/ui";
import type { UserInfo } from "metabase-types/store";

import { submitUser } from "../../../actions";
import { getIsHosted } from "../../../selectors";
import { UserForm } from "../../UserForm";
import { useForceLocaleRefresh } from "../useForceLocaleRefresh";

export const UserCreationStep = () => {
  useForceLocaleRefresh();

  // const user = {}; // TODO: pre-fill from
  const isHosted = useSelector(getIsHosted);
  const dispatch = useDispatch();

  const handleSubmit = async (user: UserInfo) => {
    await dispatch(submitUser(user)).unwrap();
    dispatch(replace("/setup/embedding/data-connection"));
  };

  return (
    <Box>
      <Title order={2} mb="md">{t`What should we call you?`}</Title>
      <Text>{t`We know you’ve already created one of these.`}</Text>
      <Text>
        {t`We like to keep billing and product accounts separate so that you don’t have to share logins.`}
      </Text>
      <UserForm
        // user={user}
        isHosted={isHosted}
        // onValidatePassword={validatePassword}
        onSubmit={handleSubmit}
      />
    </Box>
  );
};
