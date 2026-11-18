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
$('purchase-date').value = dateToday();
let cachedAccounts = [];
let cachedMovements = [];
let cachedCards = [];
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
    await loadCards();
    await loadInvoices();
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
  .in('tipo', ['receita', 'despesa', 'transferencia', 'pagamento_cartao'])
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
  const cardAccount = $('card-payment-account');
  const priorCardAccount = cardAccount.value;
  cardAccount.replaceChildren();
  const emptyCardAccount = document.createElement('option');
  emptyCardAccount.value = '';
  emptyCardAccount.textContent = 'Não definir agora';
  cardAccount.append(emptyCardAccount);
  for (const a of active) {
    const option = document.createElement('option');
    option.value = a.id;
    option.textContent = a.nome;
    cardAccount.append(option);
  }
  if (active.some(a => a.id === priorCardAccount)) cardAccount.value = priorCardAccount;
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


async function loadCards() {
  status('cards-status', 'Carregando cartões...');
  const { data, error } = await supabase.from('cartoes_credito')
    .select('id,nome,banco,bandeira,ultimos_digitos,limite_total,dia_fechamento,dia_vencimento,conta_pagamento_id,ativo')
    .order('nome');
  const host = $('cards-list');
  host.replaceChildren();
  if (error) {
    status('cards-status', `Erro ao consultar cartões: ${error.message}`, true);
    return;
  }
  cachedCards = data || [];
  refreshPurchaseCardPicker();
  status('cards-status', `${data.length} cartão(ões) encontrado(s).`);
  if (!data.length) {
    const p = document.createElement('p');
    p.textContent = 'Nenhum cartão cadastrado.';
    host.append(p);
    return;
  }
  const table = document.createElement('table');
  const header = document.createElement('tr');
  for (const title of ['Cartão', 'Limite total', 'Fechamento', 'Vencimento', 'Conta de pagamento']) {
    const th = document.createElement('th');
    th.textContent = title;
    header.append(th);
  }
  const thead = document.createElement('thead');
  thead.append(header);
  table.append(thead);
  const tbody = document.createElement('tbody');
  for (const card of data) {
    const row = document.createElement('tr');
    const account = cachedAccounts.find(a => a.id === card.conta_pagamento_id);
    const title = [card.nome, card.banco, card.bandeira, card.ultimos_digitos ? `final ${card.ultimos_digitos}` : ''].filter(Boolean).join(' — ');
    for (const value of [title, money(card.limite_total), `Dia ${card.dia_fechamento}`, `Dia ${card.dia_vencimento}`, account?.nome || 'Não definida']) {
      const td = document.createElement('td');
      td.textContent = value;
      row.append(td);
    }
    tbody.append(row);
  }
  table.append(tbody);
  host.append(table);
}

$('card-form').addEventListener('submit', async event => {
  event.preventDefault();
  const button = $('card-save-button');
  const limit = Number($('card-limit').value);
  const closing = Number($('card-closing').value);
  const due = Number($('card-due').value);
  const last4 = $('card-last4').value.trim();
  if (!Number.isFinite(limit) || limit < 0 || Math.abs(limit * 100 - Math.round(limit * 100)) > 1e-7) {
    status('card-save-status', 'Informe um limite válido, com até duas casas decimais.', true);
    return;
  }
  if (![closing, due].every(day => Number.isInteger(day) && day >= 1 && day <= 28)) {
    status('card-save-status', 'Informe dias entre 1 e 28.', true);
    return;
  }
  if (last4 && !/^[0-9]{4}$/.test(last4)) {
    status('card-save-status', 'Os últimos dígitos devem conter exatamente quatro números.', true);
    return;
  }
  const accountId = $('card-payment-account').value || null;
  if (accountId && !cachedAccounts.some(a => a.id === accountId && a.ativa)) {
    status('card-save-status', 'Selecione uma conta ativa.', true);
    return;
  }
  button.disabled = true;
  status('card-save-status', 'Salvando cartão...');
  try {
    const { error } = await supabase.from('cartoes_credito').insert({
      nome: $('card-name').value.trim(),
      banco: $('card-bank').value.trim() || null,
      bandeira: $('card-brand').value.trim() || null,
      ultimos_digitos: last4 || null,
      limite_total: limit,
      dia_fechamento: closing,
      dia_vencimento: due,
      conta_pagamento_id: accountId
    });
    if (error) throw error;
    $('card-form').reset();
    $('card-limit').value = '0.00';
    status('card-save-status', 'Cartão cadastrado com sucesso.');
    await loadCards();
    await loadInvoices();
  } catch (error) {
    status('card-save-status', `Erro ao cadastrar cartão: ${error.message}`, true);
  } finally {
    button.disabled = false;
  }
});


function refreshPurchaseCardPicker() {
  const picker = $('purchase-card');
  const old = picker.value;
  picker.replaceChildren();
  for (const card of cachedCards.filter(card => card.ativo)) {
    const option = document.createElement('option');
    option.value = card.id;
    option.textContent = `${card.nome}${card.banco ? ' — ' + card.banco : ''}`;
    picker.append(option);
  }
  if (cachedCards.some(card => card.id === old && card.ativo)) picker.value = old;
  $('purchase-save-button').disabled = !picker.options.length;
}

function monthLabel(isoDate) {
  const [year, month] = isoDate.slice(0, 10).split('-');
  return `${month}/${year}`;
}

async function loadInvoices() {
  status('invoices-status', 'Carregando parcelas...');
  const host = $('invoices-list');
  host.replaceChildren();
  const { data: purchases, error: purchaseError } = await supabase.from('compras_cartao')
    .select('id,cartao_id,descricao,data_compra,valor_total,quantidade_parcelas')
    .order('data_compra', { ascending: false }).limit(500);
  if (purchaseError) {
    status('invoices-status', `Erro ao consultar compras: ${purchaseError.message}`, true);
    return;
  }
  if (!purchases.length) {
    status('invoices-status', 'Nenhuma compra registrada.');
    return;
  }
  if (purchases.length === 500) {
    status('invoices-status', 'Limite de 500 compras atingido. A previsão pode estar incompleta.', true);
    return;
  }
  const { data: installments, error: installmentError } = await supabase.from('parcelas_cartao')
    .select('compra_id,numero_parcela,valor,competencia')
    .in('compra_id', purchases.map(p => p.id))
    .order('competencia', { ascending: true }).limit(1000);
  if (installmentError) {
    status('invoices-status', `Erro ao consultar parcelas: ${installmentError.message}`, true);
    return;
  }
  if (installments.length === 1000) {
    status('invoices-status', 'Limite de 1.000 parcelas atingido. A previsão pode estar incompleta.', true);
    return;
  }
  const purchasesById = new Map(purchases.map(p => [p.id, p]));
  const grouped = new Map();
  for (const part of installments) {
    const purchase = purchasesById.get(part.compra_id);
    if (!purchase) continue;
    const month = part.competencia.slice(0, 7);
    const key = `${month}|${purchase.cartao_id}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push({ part, purchase });
  }
  status('invoices-status', `${purchases.length} compra(s), ${installments.length} parcela(s) encontrada(s). Previsão por competência.`);
  for (const [key, items] of [...grouped.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const [month, cardId] = key.split('|');
    const card = cachedCards.find(c => c.id === cardId);
    const heading = document.createElement('h3');
    heading.textContent = `${card?.nome || 'Cartão'} — ${monthLabel(month + '-01')} — ${money(items.reduce((sum, item) => sum + Number(item.part.valor), 0))}`;
    host.append(heading);
    const table = document.createElement('table');
    const head = document.createElement('tr');
    for (const title of ['Compra', 'Parcela', 'Valor']) {
      const th = document.createElement('th'); th.textContent = title; head.append(th);
    }
    const thead = document.createElement('thead'); thead.append(head); table.append(thead);
    const tbody = document.createElement('tbody');
    for (const { part, purchase } of items) {
      const row = document.createElement('tr');
      for (const value of [purchase.descricao, `${part.numero_parcela}/${purchase.quantidade_parcelas}`, money(part.valor)]) {
        const td = document.createElement('td'); td.textContent = value; row.append(td);
      }
      tbody.append(row);
    }
    table.append(tbody); host.append(table);
  }
}

$('purchase-form').addEventListener('submit', async event => {
  event.preventDefault();
  const button = $('purchase-save-button');
  const cardId = $('purchase-card').value;
  const amount = Number($('purchase-value').value);
  const count = Number($('purchase-installments').value);
  if (!cachedCards.some(card => card.id === cardId && card.ativo)) {
    status('purchase-status', 'Selecione um cartão ativo.', true); return;
  }
  if (!Number.isFinite(amount) || amount <= 0 || Math.abs(amount * 100 - Math.round(amount * 100)) > 1e-7) {
    status('purchase-status', 'Informe um valor positivo com até duas casas decimais.', true); return;
  }
  if (!Number.isInteger(count) || count < 1 || count > 24) {
    status('purchase-status', 'Selecione entre 1 e 24 parcelas.', true); return;
  }
  if (Math.round(amount * 100) < count) {
    status('purchase-status', 'O valor deve permitir parcelas de pelo menos R$ 0,01.', true); return;
  }
  button.disabled = true;
  status('purchase-status', 'Registrando compra e parcelas...');
  try {
    const { error } = await supabase.rpc('registrar_compra_cartao', {
      p_cartao_id: cardId,
      p_descricao: $('purchase-description').value.trim(),
      p_estabelecimento: $('purchase-merchant').value.trim() || null,
      p_data_compra: $('purchase-date').value,
      p_valor_total: amount,
      p_quantidade_parcelas: count,
      p_categoria: $('purchase-category').value.trim() || null,
      p_observacoes: null
    });
    if (error) throw error;
    $('purchase-form').reset();
    $('purchase-date').value = dateToday();
    $('purchase-installments').value = '1';
    status('purchase-status', 'Compra e parcelas registradas com sucesso.');
    await loadInvoices();
  } catch (error) {
    status('purchase-status', `Erro ao registrar compra: ${error.message}`, true);
  } finally {
    button.disabled = !cachedCards.some(card => card.ativo);
  }
});

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
