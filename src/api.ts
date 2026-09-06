export type DraftResponse = {
  submission: { id: string; reference_no: string; status: string; data?: Record<string, unknown> };
  editToken?: string;
};

const json = async <T>(input: RequestInfo, init?: RequestInit): Promise<T> => {
  const response = await fetch(input, { credentials: 'same-origin', ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error?.message || 'Request failed.');
  return body;
};

export async function createDraft() {
  return json<DraftResponse>('/api/submissions', { method: 'POST', body: '{}' });
}
export async function getDraft(id: string, token: string) {
  return json<DraftResponse>(`/api/submissions/${id}`, { headers: { 'x-edit-token': token } });
}
export async function saveDraft(id: string, token: string, data: Record<string, unknown>) {
  return json<DraftResponse>(`/api/submissions/${id}`, { method: 'PATCH', headers: { 'x-edit-token': token }, body: JSON.stringify({ data }) });
}
export async function submitDraft(id: string, token: string) {
  return json<DraftResponse>(`/api/submissions/${id}/submit`, { method: 'POST', headers: { 'x-edit-token': token }, body: '{}' });
}
export async function uploadAsset(id: string, token: string, file: File, kind: 'profile' | 'project') {
  const body = new FormData(); body.append('file', file); body.append('kind', kind);
  const response = await fetch(`/api/submissions/${id}/assets`, { method: 'POST', credentials: 'same-origin', headers: { 'x-edit-token': token }, body });
  const result = await response.json();
  if (!response.ok) throw new Error(result?.error?.message || 'Upload failed.');
  return result;
}
export async function adminLogin(email: string, password: string) {
  return json<{ admin: { id: string; email: string } }>('/api/admin/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
}
export async function adminLogout() { await fetch('/api/admin/auth/logout', { method: 'POST', credentials: 'same-origin' }); }
export async function adminMe() { return json<{ admin: { id: string; email: string } }>('/api/admin/auth/me'); }
export async function adminStats() { return json<Record<string, number>>('/api/admin/stats'); }
export async function adminSubmissions(query = '', status = '', page = 1) { const params = new URLSearchParams({ q: query, page: String(page) }); if (status) params.set('status', status); return json<{ items: any[]; total: number }>(`/api/admin/submissions?${params}`); }
export async function adminSubmission(id: string) { return json<{ submission: any; notes: any[]; assets: any[] }>(`/api/admin/submissions/${id}`); }
export async function adminSetStatus(id: string, status: string) { return json(`/api/admin/submissions/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }); }
export async function adminActivity() { return json<{ items: any[] }>('/api/admin/activity'); }
export async function adminExport() { window.location.href = '/api/admin/export.csv'; }
