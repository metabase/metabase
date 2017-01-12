import palx from 'palx'

const colors = palx('#509ee3')

const colorSets = Object.keys(colors)

const getSetValues = (index) => {
    let result = []
    colorSets.map(set => {
        if(Array.isArray(colors[set])){
            colors[set].map((c, i) => {
                if(i === index) {
                    result.push(c)
                }
            })
        }
    })
    return result
}

export const normal = getSetValues(4)

export const saturated = {
    blue: '#2D86D4',
    green: '#84BB4C',
    purple: '#885AB1',
    red: '#ED6E6E',
    yellow: '#F9CF48',
}

export const desaturated = {
    blue: '#72AFE5',
    green: '#A8C987',
    purple: '#B8A2CC',
    red: '#EEA5A5',
    yellow: '#F7D97B',
}

export const harmony = [
    ...getSetValues(5),
    ...getSetValues(3),
    ...getSetValues(7),
]

