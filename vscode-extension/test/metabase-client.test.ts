import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { checkMetabaseConnection } from '../src/metabase-client'

describe('checkMetabaseConnection', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    globalThis.fetch = vi.fn()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('returns missing-host when host is empty', async () => {
    const result = await checkMetabaseConnection('', 'key123')
    expect(result).toEqual({ status: 'missing-host' })
  })

  it('returns missing-host when host is undefined', async () => {
    const result = await checkMetabaseConnection(undefined, 'key123')
    expect(result).toEqual({ status: 'missing-host' })
  })

  it('returns missing-api-key when apiKey is empty', async () => {
    const result = await checkMetabaseConnection('http://localhost:3000', '')
    expect(result).toEqual({ status: 'missing-api-key' })
  })

  it('returns missing-api-key when apiKey is undefined', async () => {
    const result = await checkMetabaseConnection('http://localhost:3000', undefined)
    expect(result).toEqual({ status: 'missing-api-key' })
  })

  it('returns success with user info on 200', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(new Response(
      JSON.stringify({ first_name: 'Ada', last_name: 'Lovelace', email: 'ada@example.com' }),
      { status: 200 },
    ))

    const result = await checkMetabaseConnection('http://localhost:3000', 'key123')
    expect(result).toEqual({
      status: 'success',
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'ada@example.com',
    })

    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://localhost:3000/api/user/current',
      { headers: { 'x-api-key': 'key123' } },
    )
  })

  it('strips trailing slashes from host', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(new Response(
      JSON.stringify({ first_name: 'A', last_name: 'B', email: 'a@b.com' }),
      { status: 200 },
    ))

    await checkMetabaseConnection('http://localhost:3000///', 'key123')

    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://localhost:3000/api/user/current',
      expect.anything(),
    )
  })

  it('returns unauthorized on 401', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(new Response(null, { status: 401 }))

    const result = await checkMetabaseConnection('http://localhost:3000', 'badkey')
    expect(result).toEqual({ status: 'unauthorized' })
  })

  it('returns unauthorized on 403', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(new Response(null, { status: 403 }))

    const result = await checkMetabaseConnection('http://localhost:3000', 'badkey')
    expect(result).toEqual({ status: 'unauthorized' })
  })

  it('returns http-error on other non-ok status', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(new Response(null, { status: 500, statusText: 'Internal Server Error' }))

    const result = await checkMetabaseConnection('http://localhost:3000', 'key123')
    expect(result).toEqual({ status: 'http-error', statusCode: 500, statusText: 'Internal Server Error' })
  })

  it('returns network-error when fetch throws', async () => {
    vi.mocked(globalThis.fetch).mockRejectedValue(new Error('ECONNREFUSED'))

    const result = await checkMetabaseConnection('http://localhost:3000', 'key123')
    expect(result).toEqual({ status: 'network-error', message: 'ECONNREFUSED' })
  })
})
