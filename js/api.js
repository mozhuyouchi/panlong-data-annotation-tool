// js/api.js - Shared data layer client (graceful degradation)

const API_BASE = window.location.origin + '/api';

const apiClient = {
  enabled: true,

  async init() {
    try {
      const res = await fetch(API_BASE + '/health', { method: 'GET', cache: 'no-cache' });
      if (!res.ok) throw new Error('API not available');
      this.enabled = true;
      console.log('[api] Server reachable, sharing enabled');
    } catch (err) {
      this.enabled = false;
      console.warn('[api] Server not reachable, running in local-only mode:', err.message);
    }
    return this.enabled;
  },

  async fetchAll() {
    if (!this.enabled) return null;
    try {
      const res = await fetch(API_BASE + '/data', { cache: 'no-cache' });
      if (!res.ok) throw new Error('Fetch failed: ' + res.status);
      return await res.json();
    } catch (err) {
      console.warn('[api] fetchAll failed:', err.message);
      return null;
    }
  },

  async push(changes) {
    if (!this.enabled) return false;
    try {
      const payload = {};
      if (changes.projectConfig !== undefined) payload.project_config = changes.projectConfig;
      if (changes.templates !== undefined) payload.templates = changes.templates;
      if (changes.attempts !== undefined) payload.attempts = changes.attempts;
      if (changes.cursors !== undefined) payload.cursors = changes.cursors;
      if (Object.keys(payload).length === 0) return true;

      const res = await fetch(API_BASE + '/data', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Push failed: ' + res.status);
      return true;
    } catch (err) {
      console.warn('[api] push failed:', err.message);
      return false;
    }
  },
};
