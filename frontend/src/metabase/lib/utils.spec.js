import { sortAlphabeticallyByKey } from './utils'

describe('sortAlphabeticallyByKey', () => {

    it('should sort an array of objects by first letter of a property', () => {
        const toSort = [
            { name: 'Arnold' },
            { name: 'Brooke' },
        ]

        const expected = { a: [toSort[0]], b: [toSort[1]] }

        expect(sortAlphabeticallyByKey(toSort, 'name')).toEqual(expected)
    })

    it('should get angry if the key is missing or does not exist', () => {
        const toSort = [
            { name: 'Arnold', state: 'AL' },
            { name: 'Brooke', state: 'AK' },
        ]

        expect(() => sortAlphabeticallyByKey(toSort, 'derp')).toThrowError()
    })
})
