import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { headlessFromEnv, runHook } from '../hook.js';

const { request, loadConfig } = vi.hoisted(() => ({
  request: vi.fn(),
  loadConfig: vi.fn(),
}));
vi.mock('../../../kernel/ipc/client.js', () => ({ request }));
vi.mock('../../../kernel/config/loader.js', () => ({ loadConfig }));

describe('headlessFromEnv', () => {
  // Measured on Claude Code 2.1.296: a `claude -p` run hands its hooks
  // CLAUDE_CODE_ENTRYPOINT=sdk-cli (Agent SDK hosts use sdk-ts / sdk-py); an
  // interactive session hands them `cli`. The payload itself carries no such
  // field, and UserPromptSubmit's `source` is absent under -p.
  it.each(['sdk-cli', 'sdk-ts', 'sdk-py'])('%s → headless', (entrypoint) => {
    expect(headlessFromEnv({ CLAUDE_CODE_ENTRYPOINT: entrypoint })).toBe(true);
  });

  it.each(['cli', ''])('%j → not headless', (entrypoint) => {
    expect(headlessFromEnv({ CLAUDE_CODE_ENTRYPOINT: entrypoint })).toBe(false);
  });

  it('absent (Codex, or an older Claude Code) → not headless', () => {
    expect(headlessFromEnv({})).toBe(false);
  });
});

describe('permission-request from a headless session', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loadConfig.mockReturnValue({ mode: 'full', approvals: {} });
    request.mockResolvedValue({ kind: 'hook.permission.result', decision: 'defer' });
    vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    vi.stubEnv('TLIVE_SESSION', '');
    vi.stubEnv('TLIVE_HOME', '/unused-tlive-test-home');
    vi.spyOn(process.stdin, Symbol.asyncIterator).mockImplementation(async function* () {
      yield Buffer.from(JSON.stringify({ cwd: '/project', session_id: 's1', tool_name: 'Bash', tool_input: { command: 'ls' } }));
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('tells the daemon the session is headless', async () => {
    vi.stubEnv('CLAUDE_CODE_ENTRYPOINT', 'sdk-cli');
    await runHook(['permission-request']);
    expect(request).toHaveBeenCalledWith(expect.objectContaining({ kind: 'hook.permission.request', headless: true }), expect.anything());
  });

  it('says nothing about it for an interactive session', async () => {
    vi.stubEnv('CLAUDE_CODE_ENTRYPOINT', 'cli');
    await runHook(['permission-request']);
    expect(request).toHaveBeenCalledWith(expect.not.objectContaining({ headless: expect.anything() }), expect.anything());
  });
});
