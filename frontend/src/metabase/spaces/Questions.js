import React, { Component } from 'react'
import { connect } from 'react-redux'
import { Link } from "metabase/spaces/Link"
import { Box, Border, Flex, Heading } from 'rebass'

import Select from 'metabase/components/Select'

import { getCurrentSpace } from './selectors'

import { PinLink } from './PinLink'

import { pinItem } from './spaces'
import { getAllEntities } from "metabase/questions/selectors";
import { loadEntities } from "metabase/questions/questions";
import { SPACES } from "metabase/spaces/fixtures";

const mapStateToProps = (state) => {
    // temporary override for having a mixture of real and fixture data
    const stateWithFixtureSpace = {
        ...state,
        params: {
            ...state.params,
            space: SPACES[2].slug
        }
    }

    // const collection = state.params.space

    return {
        space: getCurrentSpace(stateWithFixtureSpace),
        // questions: getQuestionsForSpace(state)
        // NOTE Atte Keinänen: just a quick n' dirty way to get a list of all questions
        questions: getAllEntities(state).filter((entity) => entity.collection === null)
    }
}

@connect(mapStateToProps, { loadEntities })
export class Questions extends Component  {
    componentWillMount() {
        this.props.loadEntities("cards", {f: "all", collection: "", ...location.query});
    }

    render() {
        const { questions, space, dispatch } = this.props

        return (
            <div>
                <Box w={2/3}>
                    <Flex align='center' mb={3}>
                        <Heading>
                            Questions
                        </Heading>
                        <Box ml='auto'>
                            <Select
                                width={200}
                                value={{ name: 'All', value: 'all' }}
                                options={[
                                    { name: 'All', value: 'all' },
                                    { name: 'Mine', value: 'mine' },
                                    { name: 'Favorites', value: 'favorites' },
                                ]}
                                search={false}
                                clearable={false}
                            />
                        </Box>
                    </Flex>
                    { questions.map(q =>
                        <Border bottom py={1}>
                            <Flex align='center'>
                                <Link to='Question' params={{ space: space.slug, id: q.id }}>
                                    <h3>{q.name}</h3>
                                </Link>
                                <Box ml='auto'>
                                    <Flex align='center'>
                                        <Box mx={2}>
                                            <PinLink />
                                        </Box>
                                        <Box onClick={() => dispatch(pinItem(space.id, 'question', q))}>
                                            ARCHIVE
                                        </Box>
                                    </Flex>
                                </Box>
                            </Flex>
                        </Border>
                    )}
                </Box>
            </div>
        )
    }
}

