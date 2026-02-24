export type ConnectionResult =
  | { status: 'missing-host' }
  | { status: 'missing-api-key' }
  | { status: 'unauthorized' }
  | { status: 'network-error'; message: string }
  | { status: 'http-error'; statusCode: number; statusText: string }
  | { status: 'success'; firstName: string; lastName: string; email: string }

export async function checkMetabaseConnection(host: string | undefined, apiKey: string | undefined): Promise<ConnectionResult> {
  if (!host) {
    return { status: 'missing-host' }
  }

  if (!apiKey) {
    return { status: 'missing-api-key' }
  }

  const baseUrl = host.replace(/\/+$/, '')

  let response: Response
  try {
    response = await fetch(`${baseUrl}/api/user/current`, {
      headers: { 'x-api-key': apiKey },
    })
  }
  catch (error) {
    return { status: 'network-error', message: error instanceof Error ? error.message : String(error) }
  }

  if (response.status === 401 || response.status === 403) {
    return { status: 'unauthorized' }
  }

  if (!response.ok) {
    return { status: 'http-error', statusCode: response.status, statusText: response.statusText }
  }

  const data = await response.json()
  return {
    status: 'success',
    firstName: data.first_name,
    lastName: data.last_name,
    email: data.email,
  }
}
