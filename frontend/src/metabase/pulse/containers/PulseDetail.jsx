import React from "react"
import { Box, Flex } from "grid-styled"
import { t } from 'c-3po'
import { connect } from "react-redux"

import * as Urls from "metabase/lib/urls"
import colors from "metabase/lib/colors"

import Card from "metabase/components/Card"
import EntityItem from "metabase/components/EntityItem"
import Icon from "metabase/components/Icon"
import Link from "metabase/components/Link"
import UserAvatar from "metabase/components/UserAvatar"

import { entityObjectLoader } from "metabase/entities/containers/EntityObjectLoader"

import PulseListChannel from "metabase/pulse/components/PulseListChannel";
import { savePulse } from "metabase/pulse/actions";

@entityObjectLoader({
  entityType: "pulses",
  entityId: (state, props) => props.params.pulseId,
  wrapped: true
})
@connect((state) => ({ user: state.user}), { savePulse })
class PulseDetail extends React.Component {
  render () {
    const { user, object } = this.props
    return (
      <Box mx={4}>
        <Box>
          <Flex align='center' my={3}>
            <Icon name="pulse" size={32} color={colors["accent4"]} mr={1} />
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
                    <Link to={Urls.question(card.id)} key={card.id}>
                      <EntityItem
                        variant="list"
                        name={card.name}
                        iconName='beaker'
                        item={card}
                      />
                    </Link>
                  ))}
                </Box>
              </Card>
            </Box>
            <Box w={1/3} pt={1} ml={2} mt={1}>
              <Box p={3} bg={colors["bg-medium"]} style={{ borderRadius: 4 }} >
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
                      key={channel}
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
      </Box>
    )
  }
}

export default PulseDetail
