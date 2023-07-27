import { t } from "ttag";
import _ from "underscore";
import Question from "metabase/entities/questions";
import Card from "metabase/components/Card";
import Link from "metabase/core/components/Link";
import * as Urls from "metabase/lib/urls";
import { Grid } from "@mantine/core";
import { useState } from "react";
import { Icon } from "metabase/core/components/Icon";
import UserAvatar from "metabase/components/UserAvatar";

// @ts-ignore
function ModelListView(props) {
  const { list } = props;

  return (
    <div className="wrapper mt4" style={{ padding: "1rem 5%" }}>
      <div className="pb4">
        <h1>{t`Models`}</h1>
      </div>

      <Grid>
        {list.map(l => {
          return (
            <Grid.Col span={4} key={l._card.id}>
              <Link to={Urls.question({ card: l._card })}>
                <Card
                  style={{
                    minHeight: 320,
                    padding: "40px 40px 30px 40px",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                  }}
                >
                  <div>
                    <Icon name="model" size={24} color="brand" />
                    <div className="mt1">
                      <h2>{l._card.name}</h2>
                      <p>{l._card.description || "No description"}</p>
                    </div>
                  </div>
                  <div className="mt-auto">
                    <div className="flex align-center">
                      <UserAvatar
                        user={l._card.creator}
                        style={{
                          width: "2em",
                          height: "2em",
                          fontSize: 11,
                          padding: "1.4em",
                        }}
                      />
                      <div className="ml1">
                        <p className="m0 p0">
                          {t`created ${new Date(
                            l._card.created_at,
                          ).toLocaleDateString()}`}
                        </p>
                      </div>
                    </div>
                  </div>
                </Card>
              </Link>
            </Grid.Col>
          );
        })}
      </Grid>
    </div>
  );
}

// esline-disable-next-line import/no-default-export -- deprecated usage
export default _.compose(Question.loadList({ query: () => ({ f: "model" }) }))(
  ModelListView,
);
