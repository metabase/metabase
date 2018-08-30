import React, { Component } from "react";
import { Box, Flex } from "grid-styled";
import { Link } from "react-router";

import { PageSidebar, Wrapper, PageLayout } from "./EntityLayout";

import Icon from "metabase/components/Icon";
import EntityInfo from "./EntityInfo";
import EntitySegments from "./EntitySegments";

import Visualization from "metabase/visualizations/components/Visualization";
import QuestionAndResultLoader from "metabase/containers/QuestionAndResultLoader";

import RelatedItems from "metabase/components/RelatedItems";

import colors from "metabase/lib/colors";

class EntityPage extends Component {
  render() {
    return (
      <QuestionAndResultLoader
        questionId={this.props.params.cardId}
        questionHash={this.props.location.hash}
      >
        {({ question, result, cancel, reload, rawSeries, loading }) => {
          if (!question) {
            return <div>"Loading..."</div>;
          }

          const mode = question.mode && question.mode();
          const actions = mode && mode.actions(question);

          return (
            <div key="entity">
              <Box
                className="border-bottom hover-parent hover--visibility relative"
                style={{ backgroundColor: colors["bg-white"], height: "65vh" }}
              >
                <Box className="hover-child absolute top right">
                  {!loading && (
                    <a
                      className="bordered rounded shadowed"
                      onClick={() => reload()}
                    >
                      <Icon name="reload" />
                    </a>
                  )}
                  {loading && (
                    <a onClick={() => cancel()}>
                      <Icon name="close" />
                    </a>
                  )}
                </Box>
                {rawSeries && <Visualization rawSeries={rawSeries} />}
              </Box>
              <Box>
                <Wrapper>
                  <Flex>
                    <PageLayout>
                      <EntityInfo entity={question} />
                      <RelatedItems
                        questionId={this.props.params.cardId}
                        questionHash={this.props.location.hash}
                      />
                    </PageLayout>
                    <PageSidebar>
                      <Box
                        p={2}
                        mt={4}
                        style={{
                          border: `1px solid ${colors["border"]}`,
                          borderRadius: 6,
                        }}
                      >
                        <Box>
                          <h3>Ways to view this</h3>
                          <ol>
                            {actions &&
                              actions.map(action => (
                                <li className="bordered rounded bg-white p1 inline-block">
                                  {action.question && (
                                    <Link to={action.question().getUrl()}>
                                      {action.title}
                                    </Link>
                                  )}
                                </li>
                              ))}
                          </ol>
                        </Box>
                        <EntitySegments question={question} />
                      </Box>
                    </PageSidebar>
                  </Flex>
                </Wrapper>
              </Box>
            </div>
          );
        }}
      </QuestionAndResultLoader>
    );
  }
}

export default EntityPage;
