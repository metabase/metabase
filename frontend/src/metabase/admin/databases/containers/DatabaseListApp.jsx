/* @flow weak */

import React, { Component } from "react";
import PropTypes from "prop-types";
import { connect } from "react-redux";
import { t } from "ttag";
import styled from "styled-components";

import cx from "classnames";
import MetabaseSettings from "metabase/lib/settings";

import ModalWithTrigger from "metabase/components/ModalWithTrigger";
import LoadingSpinner from "metabase/components/LoadingSpinner";
import FormMessage from "metabase/components/form/FormMessage";

import CreatedDatabaseModal from "../components/CreatedDatabaseModal";
import DeleteDatabaseModal from "../components/DeleteDatabaseModal";

import Database from "metabase/entities/databases";

import { getDeletes, getDeletionError } from "../selectors";
import { deleteDatabase, addSampleDataset } from "../database";

import Card from "metabase/components/Card";
import Icon from "metabase/components/Icon";
import Label from "metabase/components/type/Label";
import Link from "metabase/components/Link";

import { Box, Flex } from "grid-styled";

const DatabaseCard = styled(Card)`
  border: none;
  box-shadow: 0 1px 3px 2px rgba(0, 0, 0, 0.04);
  border-radius: 6px;
`;

const DatabaseTitle = styled(Label)`
  font-size: 16px;
`;

const DatabasePage = styled(Box)`
  background-image: linear-gradient(to bottom, #f9fbfe, #fff);
`;

import {
  PageHeader,
  PageActions,
  PageTools,
} from "metabase/admin/components/Page";
import Subhead from "metabase/components/type/Subhead";

const mapStateToProps = (state, props) => ({
  hasSampleDataset: Database.selectors.getHasSampleDataset(state),

  created: props.location.query.created,
  engines: MetabaseSettings.get("engines"),

  deletes: getDeletes(state),
  deletionError: getDeletionError(state),
});

const mapDispatchToProps = {
  // NOTE: still uses deleteDatabase from metabaseadmin/databases/databases.js
  // rather than metabase/entities/databases since it updates deletes/deletionError
  deleteDatabase: deleteDatabase,
  addSampleDataset: addSampleDataset,
};

@Database.loadList()
@connect(
  mapStateToProps,
  mapDispatchToProps,
)
export default class DatabaseList extends Component {
  static propTypes = {
    databases: PropTypes.array,
    hasSampleDataset: PropTypes.bool,
    engines: PropTypes.object,
    deletes: PropTypes.array,
    deletionError: PropTypes.object,
  };

  componentWillReceiveProps(newProps) {
    if (!this.props.created && newProps.created) {
      this.refs.createdDatabaseModal.open();
    }
  }

  render() {
    const {
      databases,
      hasSampleDataset,
      created,
      engines,
      deletionError,
    } = this.props;

    return (
      <div>
        <PageHeader>
          <PageTools>
            <Subhead>{t`Databases`}</Subhead>
            <PageActions>
              <Link
                to="/admin/databases/create"
                className="Button Button--primary circle flex align-center justify-center"
              >
                <Icon name="add" />
              </Link>
              {deletionError && (
                <section>
                  <FormMessage formError={deletionError} />
                </section>
              )}
            </PageActions>
          </PageTools>
        </PageHeader>
        <DatabasePage>
          <Box pt={4} ml="auto" mr="auto" w={["95%", "80%", "80%", "60%"]}>
            <ol>
              {databases ? (
                [
                  databases.map(database => {
                    const isDeleting =
                      this.props.deletes.indexOf(database.id) !== -1;
                    const engine =
                      engines && engines[database.engine]
                        ? engines[database.engine]["driver-name"]
                        : database.engine;
                    return (
                      <li
                        key={database.id}
                        className={cx({ disabled: isDeleting })}
                      >
                        <DatabaseCard pr={2} py={2} pl={3}>
                          <Flex align="center">
                            <Link
                              to={"/admin/databases/" + database.id}
                              className="link"
                            >
                              <DatabaseTitle color="inherit">
                                {database.name}
                              </DatabaseTitle>
                            </Link>
                            <Flex ml="auto" align="center">
                              <Box>
                                <Label>{engine}</Label>
                                <Label color="medium">{t`Database type`}</Label>
                              </Box>
                              {isDeleting ? (
                                <Box className="text-right">{t`Deleting...`}</Box>
                              ) : (
                                <Box
                                  pr={2}
                                  pl={3}
                                  ml={4}
                                  py={1}
                                  className="border-left"
                                >
                                  <ModalWithTrigger
                                    ref={"deleteDatabaseModal_" + database.id}
                                    triggerElement={<Icon name="trash" />}
                                  >
                                    <DeleteDatabaseModal
                                      database={database}
                                      onClose={() =>
                                        this.refs[
                                          "deleteDatabaseModal_" + database.id
                                        ].close()
                                      }
                                      onDelete={() =>
                                        this.props.deleteDatabase(database.id)
                                      }
                                    />
                                  </ModalWithTrigger>
                                </Box>
                              )}
                            </Flex>
                          </Flex>
                        </DatabaseCard>
                      </li>
                    );
                  }),
                ]
              ) : (
                <Box>
                  <LoadingSpinner />
                  <Label>{t`Loading ...`}</Label>
                </Box>
              )}
            </ol>
            {!hasSampleDataset ? (
              <Box pt={4}>
                <span
                  className={cx("p2 text-italic", {
                    "border-top": databases && databases.length > 0,
                  })}
                >
                  <a
                    className="text-light text-brand-hover no-decoration"
                    onClick={() => this.props.addSampleDataset()}
                  >{t`Bring the sample dataset back`}</a>
                </span>
              </Box>
            ) : null}
          </Box>
        </DatabasePage>
        <ModalWithTrigger ref="createdDatabaseModal" isInitiallyOpen={created}>
          <CreatedDatabaseModal
            databaseId={parseInt(created)}
            onDone={() => this.refs.createdDatabaseModal.toggle()}
            onClose={() => this.refs.createdDatabaseModal.toggle()}
          />
        </ModalWithTrigger>
      </div>
    );
  }
}
