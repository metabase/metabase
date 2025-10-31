import { useState } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import { useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { PLUGIN_TRANSFORMS_PYTHON } from "metabase/plugins";
import { Button, Icon, Menu } from "metabase/ui";

import { PickQuestionModal } from "./PickQuestionModal";

export const CreateTransformMenu = () => {
  const dispatch = useDispatch();
  const [isPickQuestionOpen, setIsPickQuestionOpen] = useState(false);

  return (
    <>
      <Menu position="bottom-end">
        <Menu.Target>
          <Button
            p="sm"
            w={36}
            h={36}
            leftSection={<Icon name="add" size={16} />}
          />
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item
            leftSection={<Icon name="notebook" />}
            onClick={() => dispatch(push(Urls.newQueryTransform()))}
          >
            {t`Query builder`}
          </Menu.Item>
          <Menu.Item
            leftSection={<Icon name="sql" />}
            onClick={() => dispatch(push(Urls.newNativeTransform()))}
          >
            {t`Native query`}
          </Menu.Item>
          {PLUGIN_TRANSFORMS_PYTHON.isEnabled && (
            <Menu.Item
              leftSection={<Icon name="snippet" />}
              onClick={() => dispatch(push(Urls.newPythonTransform()))}
            >
              {t`Python`}
            </Menu.Item>
          )}
          <Menu.Item
            leftSection={<Icon name="table" />}
            onClick={() => setIsPickQuestionOpen(true)}
          >
            {t`From existing question`}
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>

      {isPickQuestionOpen && (
        <PickQuestionModal
          onSelect={(cardId) => {
            dispatch(push(Urls.newTransformFromCard(cardId)));
            setIsPickQuestionOpen(false);
          }}
          onClose={() => setIsPickQuestionOpen(false)}
        />
      )}
    </>
  );
};
