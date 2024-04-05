import cx from "classnames";
import PropTypes from "prop-types";
import { createRef, Component } from "react";
import { t } from "ttag";

import ModalWithTrigger from "metabase/components/ModalWithTrigger";
import PopoverWithTrigger from "metabase/components/PopoverWithTrigger";
import AdminS from "metabase/css/admin.module.css";
import CS from "metabase/css/core/index.css";
import { capitalize } from "metabase/lib/formatting";
import { Icon } from "metabase/ui";

import { TriggerIconContainer, ActionLink } from "./ObjectActionSelect.styled";
import ObjectRetireModal from "./ObjectRetireModal";

export default class ObjectActionsSelect extends Component {
  constructor(props) {
    super(props);

    this.retireModal = createRef();
  }

  static propTypes = {
    object: PropTypes.object.isRequired,
    objectType: PropTypes.string.isRequired,
    objectTypeLocalized: PropTypes.string.isRequired,
    onRetire: PropTypes.func.isRequired,
  };

  async onRetire(object) {
    await this.props.onRetire(object);
    this.retireModal.current.close();
  }

  render() {
    const { object, objectType, objectTypeLocalized } = this.props;
    return (
      <div>
        <PopoverWithTrigger
          triggerElement={
            <TriggerIconContainer>
              <Icon name="ellipsis" />
            </TriggerIconContainer>
          }
        >
          <ul className={AdminS.UserActionsSelect}>
            <li>
              <ActionLink
                to={"/admin/datamodel/" + objectType + "/" + object.id}
              >
                {t`Edit`} {capitalize(objectType)}
              </ActionLink>
            </li>
            <li>
              <ActionLink
                to={
                  "/admin/datamodel/" +
                  objectType +
                  "/" +
                  object.id +
                  "/revisions"
                }
              >
                {t`Revision History`}
              </ActionLink>
            </li>
            <li className={cx(CS.mt1, CS.borderTop)}>
              <ModalWithTrigger
                ref={this.retireModal}
                triggerElement={t`Retire ${objectTypeLocalized}`}
                triggerClasses={cx(
                  CS.block,
                  CS.p2,
                  "bg-error-hover",
                  CS.textError,
                  "text-white-hover",
                  CS.cursorPointer,
                )}
              >
                <ObjectRetireModal
                  object={object}
                  objectType={objectType}
                  onRetire={this.onRetire.bind(this)}
                  onClose={() => this.retireModal.current.close()}
                />
              </ModalWithTrigger>
            </li>
          </ul>
        </PopoverWithTrigger>
      </div>
    );
  }
}
