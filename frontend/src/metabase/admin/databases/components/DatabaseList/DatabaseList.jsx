/* eslint-disable react/prop-types */
import cx from "classnames";
import PropTypes from "prop-types";
import { createRef, Component } from "react";
import { Link } from "react-router";
import { t } from "ttag";

import LoadingSpinner from "metabase/components/LoadingSpinner";
import AdminS from "metabase/css/admin.module.css";
import ButtonsS from "metabase/css/components/buttons.module.css";
import CS from "metabase/css/core/index.css";
import { FormMessage } from "metabase/forms";
import { isSyncCompleted } from "metabase/lib/syncing";
import { PLUGIN_FEATURE_LEVEL_PERMISSIONS } from "metabase/plugins";
import { Button, Flex, Modal, Text } from "metabase/ui";

import {
  TableCellContent,
  TableCellSpinner,
  AddSampleDatabaseLink,
} from "../../containers/DatabaseListApp.styled";

const query = {
  ...PLUGIN_FEATURE_LEVEL_PERMISSIONS.databaseDetailsQueryProps,
};

export default class DatabaseList extends Component {
  constructor(props) {
    super(props);

    props.databases.map(database => {
      this["deleteDatabaseModal_" + database.id] = createRef();
    });

    this.state = {
      isPermissionModalOpened: (props.created && props.createdDbId) || false,
    };
  }

  onPermissionModalClose = () => {
    this.setState({ isPermissionModalOpened: false });
  };

  static propTypes = {
    databases: PropTypes.array,
    hasSampleDatabase: PropTypes.bool,
    engines: PropTypes.object,
    deletes: PropTypes.array,
    deletionError: PropTypes.object,
    created: PropTypes.string,
    createdDbId: PropTypes.string,
    showSyncingModal: PropTypes.bool,
    closeSyncingModal: PropTypes.func,
    isAdmin: PropTypes.bool,
  };

  render() {
    const {
      databases,
      hasSampleDatabase,
      isAddingSampleDatabase,
      addSampleDatabaseError,
      engines,
      deletionError,
      isAdmin,
      createdDbId,
    } = this.props;
    const { isPermissionModalOpened } = this.state;

    const error = deletionError || addSampleDatabaseError;

    return (
      <div className={CS.wrapper} data-testid="database-list">
        <section className={cx(AdminS.PageHeader, CS.px2, CS.clearfix)}>
          {isAdmin && (
            <Link
              to="/admin/databases/create"
              className={cx(
                ButtonsS.Button,
                ButtonsS.ButtonPrimary,
                CS.floatRight,
              )}
            >{t`Add database`}</Link>
          )}
          <h2 className={CS.m0}>{t`Databases`}</h2>
        </section>
        {error && (
          <section>
            <FormMessage formError={error} />
          </section>
        )}
        <section>
          <table className={AdminS.ContentTable}>
            <thead>
              <tr>
                <th>{t`Name`}</th>
                <th>{t`Engine`}</th>
              </tr>
            </thead>
            <tbody>
              {databases ? (
                [
                  databases.map(database => {
                    const isDeleting =
                      this.props.deletes.indexOf(database.id) !== -1;
                    return (
                      <tr
                        key={database.id}
                        className={cx({ disabled: isDeleting })}
                      >
                        <td>
                          <TableCellContent>
                            {!isSyncCompleted(database) && (
                              <TableCellSpinner size={16} borderWidth={2} />
                            )}
                            <Link
                              to={"/admin/databases/" + database.id}
                              className={cx(CS.textBold, CS.link)}
                            >
                              {database.name}
                            </Link>
                          </TableCellContent>
                        </td>
                        <td>
                          {engines && engines[database.engine]
                            ? engines[database.engine]["driver-name"]
                            : database.engine}
                        </td>
                      </tr>
                    );
                  }),
                ]
              ) : (
                <tr>
                  <td colSpan={4}>
                    <LoadingSpinner />
                    <h3>{t`Loading ...`}</h3>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          {!hasSampleDatabase && isAdmin ? (
            <div className={CS.pt4}>
              <span
                className={cx(CS.p2, CS.textItalic, {
                  [CS.borderTop]: databases && databases.length > 0,
                })}
              >
                {isAddingSampleDatabase ? (
                  <span className={cx(CS.textLight, CS.noDecoration)}>
                    {t`Restoring the sample database...`}
                  </span>
                ) : (
                  <AddSampleDatabaseLink
                    onClick={() => this.props.addSampleDatabase(query)}
                  >
                    {t`Bring the sample database back`}
                  </AddSampleDatabaseLink>
                )}
              </span>
            </div>
          ) : null}
        </section>

        {/* Needed to make this a composed modal to get the padding we wanted.
            Not sure why the padding prop didn't work */}
        <Modal.Root
          opened={isPermissionModalOpened}
          size={620}
          withCloseButton={false}
        >
          <Modal.Overlay />
          <Modal.Content p="1rem">
            <Modal.Header>
              <Modal.Title fz="1.25rem">{t`Your database was added! Want to configure permissions?`}</Modal.Title>
            </Modal.Header>
            <Modal.Body>
              <Text
                mb="1.5rem"
                mt="1rem"
              >{t`You can change these settings later in the Permissions tab. Do you want to configure it?`}</Text>
              <Flex justify="end">
                <Button
                  mr="0.5rem"
                  onClick={this.onPermissionModalClose}
                >{t`Maybe later`}</Button>
                <Button
                  component={Link}
                  variant="filled"
                  to={`/admin/permissions/data/database/${createdDbId}`}
                >{t`Configure permissions`}</Button>
              </Flex>
            </Modal.Body>
          </Modal.Content>
        </Modal.Root>
      </div>
    );
  }
}
