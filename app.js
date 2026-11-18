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
$('movement-date').value = dateToday();
$('transfer-date').value = dateToday();
let cachedAccounts = [];
let cachedMovements = [];
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
  if (error) { status('account-status', `Erro ao consultar contas: ${error.message}`, true); return; }
  cachedAccounts = data || [];
  const { data: movements, error: movementError } = await supabase.from('movimentacoes_financeiras')
    .select('id,conta_id,tipo,descricao,valor,data_movimentacao,categoria,direcao_transferencia,transferencia_id')
    .in('tipo', ['receita', 'despesa', 'transferencia']).order('data_movimentacao', { ascending: false }).limit(1000);
  if (movementError) {
    status('movement-list-status', `Erro ao consultar movimentações: ${movementError.message}`, true);
    cachedMovements = [];
    status('account-status', 'Saldos indisponíveis: não foi possível consultar as movimentações.', true);
  } else {
    cachedMovements = movements || [];
    status('movement-list-status', cachedMovements.length === 1000 ? 'Exibindo até 1.000 movimentações. Saldos não devem ser considerados completos.' : `${cachedMovements.length} movimentação(ões) registrada(s).`, cachedMovements.length === 1000);
  }
  const picker = $('movement-account');
  const previous = picker.value;
  picker.replaceChildren();
  for (const a of cachedAccounts.filter(a => a.ativa)) {
    const option = document.createElement('option'); option.value = a.id; option.textContent = a.nome; picker.append(option);
  }
  if (cachedAccounts.some(a => a.id === previous && a.ativa)) picker.value = previous;
  const active = cachedAccounts.filter(a => a.ativa);
  for (const id of ['transfer-from', 'transfer-to']) {
    const select = $(id);
    const old = select.value;
    select.replaceChildren();
    for (const a of active) {
      const opt = document.createElement('option');
      opt.value = a.id;
      opt.textContent = a.nome;
      select.append(opt);
    }
    if (active.some(a => a.id === old)) select.value = old;
  }
  if ($('transfer-from').value === $('transfer-to').value && active.length > 1) {
    $('transfer-to').value = active.find(a => a.id !== $('transfer-from').value).id;
  }
  $('transfer-save-button').disabled = active.length < 2;
  $('movement-save-button').disabled = !picker.options.length;
  const host = $('accounts'); host.replaceChildren();
  if (!cachedAccounts.length) { status('account-status', 'Nenhuma conta cadastrada.'); $('movements').replaceChildren(); return; }
  if (!movementError) status('account-status', `${cachedAccounts.length} conta(s) encontrada(s).`);
  const table = document.createElement('table');
  const head = document.createElement('thead'); const headerRow = document.createElement('tr');
  for (const title of ['Conta', 'Tipo', 'Saldo calculado']) { const th = document.createElement('th'); th.textContent = title; headerRow.append(th); }
  head.append(headerRow); table.append(head);
  const body = document.createElement('tbody');
  for (const a of cachedAccounts) {
    const row = document.createElement('tr');
    const cents = Math.round(Number(a.saldo_inicial) * 100) + cachedMovements.filter(m => m.conta_id === a.id).reduce((total,m) => total + (m.tipo === 'receita' || (m.tipo === 'transferencia' && m.direcao_transferencia === 'entrada') ? 1 : -1) * Math.round(Number(m.valor) * 100), 0);
    for (const value of [a.nome + (a.instituicao ? ' — ' + a.instituicao : ''), a.tipo, movementError ? 'Indisponível' : money(cents / 100)]) { const cell = document.createElement('td'); cell.textContent = value; row.append(cell); }
    body.append(row);
  }
  table.append(body); host.append(table);
  const list = $('movements'); list.replaceChildren();
  if (movementError) return;
  if (!cachedMovements.length) { const p = document.createElement('p'); p.textContent = 'Nenhuma movimentação cadastrada.'; list.append(p); return; }
  const mt = document.createElement('table'); const mh = document.createElement('thead'); const mr = document.createElement('tr');
  for (const t of ['Data','Conta','Descrição','Tipo','Valor']) { const th = document.createElement('th'); th.textContent = t; mr.append(th); }
  mh.append(mr); mt.append(mh); const mb = document.createElement('tbody');
  for (const m of cachedMovements.slice(0,50)) {
    const row = document.createElement('tr');
    const a = cachedAccounts.find(a => a.id === m.conta_id);
    for (const value of [m.data_movimentacao?.split('-').reverse().join('/') || '', a?.nome || 'Conta não encontrada', m.descricao, m.tipo === 'transferencia' ? (m.direcao_transferencia === 'entrada' ? 'Transferência recebida' : 'Transferência enviada') : m.tipo === 'receita' ? 'Receita' : 'Despesa', `${m.tipo === 'despesa' || (m.tipo === 'transferencia' && m.direcao_transferencia === 'saida') ? '−' : '+'} ${money(m.valor)}`]) { const td = document.createElement('td'); td.textContent = value; row.append(td); }
    mb.append(row);
  }
  mt.append(mb); list.append(mt);
}

$('transfer-form').addEventListener('submit', async event => {
  event.preventDefault();
  const button = $('transfer-save-button');
  const from = $('transfer-from').value;
  const to = $('transfer-to').value;
  const value = Number($('transfer-value').value);
  if (!from || !to || from === to) {
    status('transfer-status', 'Selecione duas contas diferentes.', true); return;
  }
  if (!Number.isFinite(value) || value <= 0 || Math.abs(value * 100 - Math.round(value * 100)) > 1e-7) {
    status('transfer-status', 'Informe um valor positivo com até duas casas decimais.', true); return;
  }
  if (!cachedAccounts.some(a => a.id === from && a.ativa) || !cachedAccounts.some(a => a.id === to && a.ativa)) {
    status('transfer-status', 'Selecione duas contas ativas.', true); return;
  }
  button.disabled = true;
  status('transfer-status', 'Registrando transferência...');
  try {
    const { error } = await supabase.rpc('transferir_entre_contas', {
      p_conta_origem: from,
      p_conta_destino: to,
      p_valor: value,
      p_data: $('transfer-date').value,
      p_descricao: $('transfer-description').value.trim() || 'Transferência entre contas'
    });
    if (error) throw error;
    $('transfer-value').value = '';
    status('transfer-status', 'Transferência registrada com sucesso.');
    await loadAccounts();
  } catch (error) {
    status('transfer-status', `Erro na transferência: ${error.message}`, true);
  } finally {
    button.disabled = cachedAccounts.filter(a => a.ativa).length < 2;
  }
});

$('movement-form').addEventListener('submit', async event => {
  event.preventDefault();
  const button = $('movement-save-button'); button.disabled = true;
  status('movement-save-status', 'Salvando movimentação...');
  try {
    const value = Number($('movement-value').value);
    if (!Number.isFinite(value) || value <= 0 || Math.abs(value * 100 - Math.round(value * 100)) > 1e-7) throw Error('Informe um valor positivo com até duas casas decimais.');
    const accountId = $('movement-account').value;
    if (!cachedAccounts.some(a => a.id === accountId && a.ativa)) throw Error('Selecione uma conta ativa.');
    const { error } = await supabase.from('movimentacoes_financeiras').insert({
      conta_id: accountId, tipo: $('movement-type').value,
      descricao: $('movement-description').value.trim(), valor: value,
      data_movimentacao: $('movement-date').value,
      categoria: $('movement-category').value.trim() || null
    });
    if (error) throw error;
    $('movement-form').reset(); $('movement-date').value = dateToday();
    status('movement-save-status', 'Movimentação salva com sucesso.');
    await loadAccounts();
  } catch (error) { status('movement-save-status', `Erro: ${error.message}`, true); }
  finally { button.disabled = !cachedAccounts.some(a => a.ativa); }
});

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
