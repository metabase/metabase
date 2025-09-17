import { t } from "ttag";

import { useUpdateSettingsMutation } from "metabase/api";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { loadCurrentUser } from "metabase/redux/user";
import { Box, Text, Title } from "metabase/ui";
import type { UserInfo } from "metabase-types/store";

import { submitUser } from "../../../actions";
import { getIsHosted, getUser } from "../../../selectors";
import { UserForm } from "../../UserForm";
import { useEmbeddingSetup } from "../EmbeddingSetupContext";

export const UserCreationStep = () => {
  const { goToNextStep } = useEmbeddingSetup();

  const user = useSelector(getUser);
  const isHosted = useSelector(getIsHosted);
  const dispatch = useDispatch();
  const [updateSettings] = useUpdateSettingsMutation();

  const handleSubmit = async (user: UserInfo) => {
    await dispatch(submitUser(user)).unwrap();
    await dispatch(loadCurrentUser());

    // We want to set the embedding homepage visible if the user skips the rest of the flow.
    // This is the first place where we can do this, as we need the initial setup to be done.
    await updateSettings({ "embedding-homepage": "visible" });
    goToNextStep();
  };

  return (
    <Box>
      <Title order={2} mb="md">{t`What should we call you?`}</Title>
      <Text>{t`We know you’ve already created one of these.`}</Text>
      <Text>
        {t`We like to keep billing and product accounts separate so that you don’t have to share logins.`}
      </Text>
      <UserForm user={user} isHosted={isHosted} onSubmit={handleSubmit} />
    </Box>
  );
};
