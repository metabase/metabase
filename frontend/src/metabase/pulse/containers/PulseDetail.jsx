import React from "react"
import { Box, Flex } from "rebass"
import { t } from 'c-3po'
import { connect } from "react-redux"

import * as Urls from "metabase/lib/urls"
import { normal } from "metabase/lib/colors"

import Card from "metabase/components/Card"
import EntityItem from "metabase/components/EntityItem"
import Icon from "metabase/components/Icon"
import Link from "metabase/components/Link"
import UserAvatar from "metabase/components/UserAvatar"

import EntityObjectLoader from "metabase/entities/containers/EntityObjectLoader"

import PulseListChannel from "metabase/pulse/components/PulseListChannel";
import { savePulse } from "metabase/pulse/actions";

const PulseLoader = ({ pulseId, ...props }) =>
  <EntityObjectLoader
    entityType="pulses"
    entityId={pulseId}
    {...props}
  />

@connect((state) => ({ user: state.user}), { savePulse })
class PulseDetail extends React.Component {
  render () {
    const { user } = this.props
    return (
      <Box mx={4}>
        <PulseLoader pulseId={this.props.params.pulseId}>
          {({ object }) => {
            return (
              <Box>
                <Flex align='center' my={3}>
                  <Icon name="pulse" size={32} color={normal.yellow} mr={1} />
                  <h1>{object.name}</h1>
                  <Box ml='auto'>
                    {!object.read_only &&(
                      <Link to={Urls.pulseEdit(object.id)}>
                        <Icon name="pencil" />
                      </Link>
                    )}
                  </Box>
                </Flex>
                <Box>
                  <h4>{t`Pulse contents`}</h4>
                </Box>
                <Flex>
                  <Box w={2/3}>
                    <Card my={2}>
                      <Box>
                        {object.cards.map((card, index) => (
                          <Link to={Urls.question(card.id)}>
                            <EntityItem
                              name={card.name}
                              // TODO - this should be the item type
                              iconName='beaker'
                              item={card}
                              iconColor=''
                            />
                          </Link>
                        ))}
                      </Box>
                    </Card>
                  </Box>
                  <Box w={1/3} pt={1} ml={2} mt={1}>
                    <Box p={3} bg='#f1f3f5' style={{ borderRadius: 4 }} >
                      <Flex align='center'>
                        <UserAvatar
                          user={object.creator}
                        />
                        <Box ml={1}>
                          <h4 className="text-grey-4 text-bold">{t`Created by ${object.creator.common_name}`}</h4>
                        </Box>
                      </Flex>
                      <Box>
                        {object.channels.filter(channel => channel.enabled).map(channel => (
                          <PulseListChannel
                            pulse={object}
                            channel={channel}
                            user={user}
                            savePulse={this.props.savePulse}
                          />
                        ))}
                      </Box>
                    </Box>
                  </Box>
                </Flex>
              </Box>
            )
          }}
        </PulseLoader>
      </Box>
    )
  }
}

export default PulseDetail
