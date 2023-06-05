import { createRef, Component } from "react";
import PropTypes from "prop-types";

import { t } from "ttag";
import { Icon } from "metabase/core/components/Icon";
import PopoverWithTrigger from "metabase/components/PopoverWithTrigger";
import ModalWithTrigger from "metabase/components/ModalWithTrigger";
import { capitalize } from "metabase/lib/formatting";
import ObjectRetireModal from "./ObjectRetireModal";

import { ActionLink } from "./ObjectActionSelect.styled";

export default class ObjectActionsSelect extends Component {
  constructor(props) {
    super(props);

    this.retireModal = createRef();
  }
  static propTypes = {
    object: PropTypes.object.isRequired,
    objectType: PropTypes.string.isRequired,
    onRetire: PropTypes.func.isRequired,
  };

  async onRetire(object) {
    await this.props.onRetire(object);
    this.retireModal.current.close();
  }

  render() {
    const { object, objectType } = this.props;
    return (
      <div>
        <PopoverWithTrigger
          triggerElement={
            <span className="text-light text-brand-hover">
              <Icon name="ellipsis" />
            </span>
          }
        >
          <ul className="UserActionsSelect">
            <li>
              <ActionLink
                to={"/admin/datamodel/" + objectType + "/" + object.id}
                data-metabase-event={"Data Model;" + objectType + " Edit Page"}
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
                data-metabase-event={"Data Model;" + objectType + " History"}
              >
                {t`Revision History`}
              </ActionLink>
            </li>
            <li className="mt1 border-top">
              <ModalWithTrigger
                ref={this.retireModal}
                triggerElement={"Retire " + capitalize(objectType)}
                triggerClasses="block p2 bg-error-hover text-error text-white-hover cursor-pointer"
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
