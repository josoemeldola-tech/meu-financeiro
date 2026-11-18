import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = 'https://joifoydmuphbwwmgmuoh.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_wh7nq3Pf1D-zDxR-4SyAIg_6rGa0_zf';
const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
const $ = id => document.getElementById(id);
const money = n => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(n));
const dateToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

$('opening-date').value = dateToday();
let recovering = false;
let recoveryReady = false;

function status(id, message, isError = false) {
  const el = $(id);
  el.textContent = message;
  el.className = isError ? 'error' : 'success';
}

function showRecovery() {
  recovering = true;
  $('login').style.display = 'none';
  $('app').style.display = 'none';
  $('logout').style.display = 'none';
  $('recovery').style.display = 'block';
}

async function renderSession() {
  if (recovering) {
    showRecovery();
    return;
  }
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error) status('login-status', error.message, true);
  const logged = !!session;
  $('login').style.display = logged ? 'none' : 'block';
  $('app').style.display = logged ? 'block' : 'none';
  $('logout').style.display = logged ? 'inline-block' : 'none';
  $('recovery').style.display = 'none';
  if (logged) {
    $('welcome').textContent = `Conectado como ${session.user.email}`;
    await loadAccounts();
  }
}

async function loadAccounts() {
  status('account-status', 'Carregando contas...');
  const { data, error } = await supabase.from('contas_financeiras')
    .select('id,nome,instituicao,tipo,saldo_inicial,data_saldo_inicial,ativa').order('nome');
  if (error) {
    status('account-status', `Não foi possível carregar as contas: ${error.message}`, true);
    return;
  }
  const host = $('accounts');
  host.replaceChildren();
  if (!data.length) {
    status('account-status', 'Nenhuma conta cadastrada.');
    return;
  }
  status('account-status', `${data.length} conta(s) encontrada(s).`);
  const table = document.createElement('table');
  const head = document.createElement('thead');
  const headerRow = document.createElement('tr');
  for (const title of ['Conta', 'Tipo', 'Saldo inicial']) {
    const th = document.createElement('th');
    th.textContent = title;
    headerRow.append(th);
  }
  head.append(headerRow);
  table.append(head);
  const body = document.createElement('tbody');
  for (const account of data) {
    const row = document.createElement('tr');
    for (const value of [account.nome + (account.instituicao ? ' — ' + account.instituicao : ''), account.tipo, money(account.saldo_inicial)]) {
      const cell = document.createElement('td');
      cell.textContent = value;
      row.append(cell);
    }
    body.append(row);
  }
  table.append(body);
  host.append(table);
}

$('login-form').addEventListener('submit', async event => {
  event.preventDefault();
  $('login-button').disabled = true;
  status('login-status', 'Entrando...');
  try {
    const { error } = await supabase.auth.signInWithPassword({
      email: $('email').value.trim(), password: $('password').value
    });
    if (error) throw error;
    $('password').value = '';
    status('login-status', '');
    await renderSession();
  } catch (error) {
    status('login-status', `Falha no login: ${error.message}`, true);
  } finally {
    $('login-button').disabled = false;
  }
});

$('forgot-password').addEventListener('click', async () => {
  const email = $('email').value.trim() || prompt('Informe o e-mail cadastrado no Meu Financeiro:');
  if (!email) return;
  $('email').value = email;
  status('login-status', 'Solicitando recuperação...');
  $('forgot-password').disabled = true;
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: 'https://josoemeldola-tech.github.io/meu-financeiro/'
    });
    if (error) throw error;
    status('login-status', 'Se o e-mail estiver cadastrado, você receberá um link para definir uma nova senha.');
  } catch (error) {
    status('login-status', `Não foi possível solicitar a recuperação: ${error.message}`, true);
  } finally {
    $('forgot-password').disabled = false;
  }
});

$('recovery-form').addEventListener('submit', async event => {
  event.preventDefault();
  const password = $('new-password').value;
  if (password !== $('confirm-password').value) {
    status('recovery-status', 'As senhas não coincidem.', true);
    return;
  }
  if (!recoveryReady) {
    status('recovery-status', 'O link de recuperação não foi validado. Solicite um novo link em “Esqueci minha senha”.', true);
    return;
  }
  $('recovery-button').disabled = true;
  status('recovery-status', 'Salvando nova senha...');
  try {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
    $('recovery-form').reset();
    recoveryReady = false;
    recovering = false;
    history.replaceState(null, '', location.pathname);
    status('login-status', 'Senha alterada com sucesso. Entre com a nova senha.');
    await supabase.auth.signOut();
    await renderSession();
  } catch (error) {
    status('recovery-status', `Não foi possível alterar a senha: ${error.message}`, true);
  } finally {
    $('recovery-button').disabled = false;
  }
});

$('back-to-login').addEventListener('click', async () => {
  recovering = false;
  recoveryReady = false;
  history.replaceState(null, '', location.pathname);
  await supabase.auth.signOut();
  await renderSession();
});

$('logout').addEventListener('click', async () => {
  const { error } = await supabase.auth.signOut();
  if (error) {
    status('account-status', error.message, true);
    return;
  }
  await renderSession();
});

$('account-form').addEventListener('submit', async event => {
  event.preventDefault();
  $('save-button').disabled = true;
  status('save-status', 'Salvando...');
  try {
    const balance = Number($('opening-balance').value);
    if (!Number.isFinite(balance) || Math.abs(Math.round(balance * 100) - balance * 100) > 1e-7) {
      throw Error('Saldo deve ter no máximo duas casas decimais');
    }
    const { error } = await supabase.from('contas_financeiras').insert({
      nome: $('account-name').value.trim(),
      instituicao: $('institution').value.trim() || null,
      tipo: $('type').value,
      saldo_inicial: balance,
      data_saldo_inicial: $('opening-date').value
    });
    if (error) throw error;
    $('account-form').reset();
    $('opening-date').value = dateToday();
    $('opening-balance').value = '0.00';
    status('save-status', 'Conta cadastrada.');
    await loadAccounts();
  } catch (error) {
    status('save-status', `Erro: ${error.message}`, true);
  } finally {
    $('save-button').disabled = false;
  }
});

// Supabase fires PASSWORD_RECOVERY when a valid recovery link is opened.
supabase.auth.onAuthStateChange((event) => {
  if (event === 'PASSWORD_RECOVERY') {
    recoveryReady = true;
    showRecovery();
    status('recovery-status', 'Link confirmado. Escolha uma nova senha.');
  } else if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'INITIAL_SESSION') {
    setTimeout(() => { renderSession().catch(console.error); }, 0);
  }
});

const params = new URLSearchParams(location.search);
const hash = new URLSearchParams(location.hash.replace(/^#/, ''));
if (params.get('type') === 'recovery' || hash.get('type') === 'recovery' || params.has('code')) {
  showRecovery();
  status('recovery-status', 'Validando link de recuperação...');
  // If Supabase does not emit PASSWORD_RECOVERY (e.g. expired link), saving remains disabled by recoveryReady.
}
renderSession().catch(error => status('login-status', error.message, true));
