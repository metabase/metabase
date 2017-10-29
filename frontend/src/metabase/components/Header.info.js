import React from 'react'
import Header from 'metabase/components/Header'

import EntityMenu from 'metabase/components/EntityMenu'

export const component = Header

export const description = `
    A header for an item.
`
export const examples = {
    'A new item with buttons': (
        <Header
            objectType='dashboard'
            item={{}}
            headerButtons={[[
                <EntityMenu
                    triggerIcon='pencil'
                    items={[
                        { title: 'Action', icon: 'editdocument', link: '/' }
                    ]}
                />
            ]]}
        />
    ),
    'An existing item with buttons': (
        <Header
            item={{
                id: 1,
                name: 'Thing',
                description: 'What a neat thing'
            }}
            headerButtons={[[
                <EntityMenu
                    triggerIcon='pencil'
                    items={[
                        { title: 'Action', icon: 'editdocument', link: '/' }
                    ]}
                />,
                <EntityMenu
                    triggerIcon='share'
                    items={[
                        { title: 'Action', icon: 'editdocument', link: '/' }
                    ]}
                />,
                <EntityMenu
                    triggerIcon='burger'
                    items={[
                        { title: 'Action', icon: 'editdocument', link: '/' }
                    ]}
                />
            ]]}
        />
    ),
    'Editing': (
        <Header
            item={{
                id: 2,
                name: 'Cool thing',
                description: 'This is a cool thing'
            }}
            isEditing={true}
            isEditingInfo={true}
            editButtons={[[
            ]]}
            editingTitle="It's edit time"
        />
    )
}
